/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * Client controller that handles command execution and whatnot
 *
 * @class
 * @extends EchoesObject
 */
function EchoesClient(socket, ui, crypto) {
    EchoesObject.call(this, 'socket');

    this.socket = socket; // socket.io object ref
    this.ui = ui; // ui object ref
    this.crypto = crypto; // crypto object ref
}
EchoesClient.prototype = Object.create(EchoesObject.prototype);
EchoesClient.prototype.constructor = EchoesClient;

/**
 * Process and execute a client command
 *
 * Example: ['/keyx','nick'] - ['/who'] - ['/eecho','nick','echo']
 *
 * If not handled locally, pass to server
 *
 * @param   {Array} params  An array of parameters to process
 *
 * @returns {null}
 */
EchoesClient.prototype.execute_command = function(params) {
    var command = params[0];
    params.shift();

    switch (command) {
        case '/config':
            switch(params[0]) {
                case 'LOG_LEVEL':
                    var val = parseInt(params[1]);
                    if (isNaN(val)) {
                        val = AppConfig.LOG_LEVEL;
                    }
                    AppConfig.LOG_LEVEL = val;
                    this.ui.status('AppConfig.LOG_LEVEL = ' + val);
                    this.log('AppConfig.LOG_LEVEL = ' + val, 0);
                break;
                case 'CONSOLE_LOG':
                    var val = (params[1] == "1" || params[1] == "true" ? true : false);

                    AppConfig.CONSOLE_LOG = val;
                    this.ui.status('AppConfig.CONSOLE_LOG = ' + val);
                    this.log('AppConfig.CONSOLE_LOG = ' + val, 0);
                break;
                default:
                    this.ui.error('Invalid AppConfig variable');
                    this.log('Invalid AppConfig variable ' + params[0], 3);
                break;
            }
        break;
        case '/clear':
            this.ui.ui.echoes.html('');
        break;
        case '/pm':
        case '/msg':
        case '/private':
        case '/win':
        case '/window':
        case '/query':
            var nick = params[0];
            this.socket.emit('/pm', nick);
        break;
        case '/echo':
            var chan = params[0];
            var echo = params[1];

            this.ui.echo($me + ' ))) ' + echo);
            this.socket.emit('/echo', { echo: echo, to: chan });
        break;
        case '/eecho':
            var nick = params[0];
            var plaintext = params[1];

            send_encrypted_echo(nick, plaintext);
        break;
        case '/keyx':
            keyx_send_key(params[0]);
        break;
        case '/keyx_off':
            keyx_off(params[0], true);
        break;
        default:
            this.socket.emit(command, params);
            this.log('passed unhandled command to server: ' + command + ' ' + params.join(' '), 0);
        break
    }
}

/**
 * Fetch the echo from input and parse.
 *
 * Determines if the first word is a command, if so pass to
 * this.execute_command() for further processing
 *
 * Determines if window state is 'encrypted' and automtically encrypts normal echoes
 *
 * @returns {null}
 */
EchoesClient.prototype.send_echo = function() {
    var echo = this.ui.ui.input.val();
    var split = echo.trim().split(' ');
    var to = this.ui.active_window().attr('windowname');

    if (echo == '') {
        this.ui.ui.input.focus();
        return;
    }

    if (split[0][0] == '/') {
        this.execute_command(split);
    } else {
        if (this.ui.active_window().attr('encryptionstate') == 'encrypted') {
            this.execute_command(['/eecho', to, echo]);
        } else {
            this.execute_command(['/echo', to, echo]);
        }
    }

    this.ui.ui.input.val('');
    this.ui.ui.input.focus();
}

/**
 * Looks for channel windows and autojoins
 *
 * @returns {null}
 */
EchoesClient.prototype.join_channels = function() {
    var self = this;

    this.log('Auto-joining channels...', 1);
    this.ui.joined_channels().each(function() {
        self.execute_command(['/join', $(this).attr('windowname')]);
    });
}
