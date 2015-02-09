/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * Socket controller that handles talking to server backend
 * Also sets up event handlers
 *
 * @class
 * @extends EchoesObject
 */
function EchoesSocket() {
    EchoesObject.call(this, 'socket');

    this.socket = null;
    this.me = null;
    this.session_id = null;

    /**
     * Controller object references
     */
    this.client = null;
    this.ui = null;
    this.crypto = null;

    /**
     * @type string Store last connect/reconnect error from socket.io to avoid repeats
     */
    this.last_error = null;
}
EchoesSocket.prototype = Object.create(EchoesObject.prototype);
EchoesSocket.prototype.constructor = EchoesSocket;

/**
 * Initializes a socket and attaches appropriate events
 *
 * @see EchoesSocket#attach_socket_events
 *
 * @returns {null}
 */
EchoesSocket.prototype.initialize = function() {
    if (! this.me) {
        this.log('Nickname is null, abort init', 3);
        return;
    }

    var socket_query = encodeURI('session_id=' + this.session_id + '&nickname=' + this.me);

    this.socket = null;
    this.socket = io(AppConfig.WS_SERVER, {
        query: socket_query,
        forceNew: true,
        multiplex: false,
        transports: AppConfig.ALLOWED_TRANSPORTS,
        autoConnect: true,
    });

    this.attach_socket_events();

    this.log("connecting to " + AppConfig.WS_SERVER + "?" + socket_query + " as '" + this.me + "' with session_id: " + this.session_id, 1);
}

/**
 * Attaches socket events to this.socket
 *
 * @returns {null}
 */
EchoesSocket.prototype.attach_socket_events = function() {
    var self = this;

    this.socket.on('*me', function(me) {
        self.me = me;
        self.ui.status('Hi ' + self.me + ', /join a channel and say something!', self.ui.ui.echoes.attr('windowname'));

        self.client.execute_command(['/who']);
    });

    this.socket.on('*pm', function(nick) {
        self.ui.add_nickname(nick);
        self.ui.ui.lists.nicknames.find('li[windowname="' + nick + '"]')
            .click();
    });

    this.socket.on('*join', function(join) {
        var chan = join.channel;
        var nick = join.nickname;

        if (nick == self.me) {
            self.ui.add_channel(chan);
            self.ui.show_window(chan);
        }

        self.ui.status((nick == self.me ? 'You have' : nick) + ' joined ' + chan, chan);
    });
    this.socket.on('*part', function(part) {
        var chan = part.channel;
        var nick = part.nickname;
        var reason = part.reason;
        var and_echoes = false;

        if (nick == self.me) {
            self.ui.remove_channel(chan);
            self.ui.show_window(self.ui.ui.echoes.attr('windowname'));
            and_echoes = true;
        }
        self.ui.status((nick == self.me ? 'You have' : nick) + ' parted ' + chan + (reason ? ' (' + reason + ')' : ''), chan, and_echoes);
    });

    this.socket.on('*ulist', function(list) {
        self.ui.clear_channels();

        for (var i in list.channels) {
            self.ui.add_channel(list.channels[i]);
        }
    });
    this.socket.on('*list', function(list){
        self.ui.status('Channel listing: ' + list.channels.join(', '), null, true);
    });
    this.socket.on('*who', function(who) {
        self.ui.clear_nicknames();
        for (var n in who.nicknames) {
            self.ui.add_nickname(who.nicknames[n]);
        }

        self.ui.status("Who's online? " + who.nicknames.join(', '), null, true);
        if (who.nicknames.length > 1 && ! self.ui.ui.lists.nicknames.is(':visible')) {
            self.ui.ui.buttons.nicknames.click();
        }
    });
    this.socket.on('*connect', function(who) {
        self.ui.add_nickname(who.nickname);
        self.ui.status(who.nickname + ' connected!', who.nickname, true);
    });
    this.socket.on('*disconnect', function(who) {
        self.ui.remove_nickname(who.nickname);
        self.client.keyx_off(who.nickname, false);
        self.ui.status(who.nickname + ' disconnected!', who.nickname, true);
    });

    this.socket.on('*echo', function(echo) {
        switch (echo.type) {
            case 'encrypted':
                self.ui.log('eecho incoming: ' + echo.from + ': ' + JSON.stringify(echo), 0);
                self.client.decrypt_encrypted_echo(echo.from, echo.echo);
            break;

            case 'pm':
                self.ui.add_window(echo.from, 'nickname');
                self.ui.echo(echo.from + ' ))) ' + echo.echo, echo.from);
            break;
            case 'all':
            case 'channel':
                self.ui.echo(echo.from + ' ))) ' + echo.echo, echo.to);
            break;
        }
    });

    this.socket.on('*keyx', function(data){
        self.ui.log('keyx incoming: ' + data.from + '@me' + ': ' + JSON.stringify(data), 0);

        if (typeof data.keychain != 'undefined'
            && data.keychain == 'keyx'
            && ! self.crypto.browser_support.ec.supported) {
            self.socket.emit('!keyx_unsupported', {
                to: data.from
            });
            self.ui.log('keyx method not supported, sending back notification', 3);
            return;
        }

        self.client.keyx_import(data);
    });
    this.socket.on('*keyx_unsupported', function(data){
        self.ui.log('keyx_unsupported incoming from: ' + data.from, 0);
        self.client.keyx_off(data.from, false); // do not emit another !keyx_off

        self.ui.status('Key rejected, falling back...');

        self.client.set_nickchain_property(data.from, { keychain: 'encrypt' });
        self.client.keyx_send_key(data.from);
    });
    this.socket.on('*keyx_off', function(data){
        self.ui.log('keyx_off incoming from: ' + data.from, 0);
        self.client.keyx_off(data.from, false); // do not emit another !keyx_off
    });
    this.socket.on('*keyx_sent', function(data){
        var nick = data.to;

        self.client.set_nickchain_property(nick, {
            keysent: true,
        });

        if (data.keychain == 'keyx') {
            self.client.keyx_derive_key(nick, self.crypto.keychain[data.keychain].private_key, self.client.get_nickchain_property(nick, 'public_key'));
        }

        self.client.update_encrypt_state(nick);

        self.ui.status('Public key sent to ' + nick + ' (' + self.crypto.keychain[self.client.get_nickchain_property(nick, 'keychain')].exported.hash + ')');
        self.ui.log('keyx sent to: ' + nick + ': ' + JSON.stringify(data), 0);
    });

    this.socket.on('*eecho_sent', function(data){
        self.ui.log('eecho sent: ' + data.to + ': ' + JSON.stringify(data), 0);
    });

    this.socket.on('*error', function(message){
        self.ui.error(message, null, true);
        self.ui.log(message, 3);
    });
    this.socket.on('*fatal', function(e) {
        self.ui.log('fatal! ' + e, 3);
        switch (e) {
            case 'nick_invalid':
                self.me = null;
                self.ui.get_me('Bad nickname :( try again');
            break;
            case 'nick_exists':
                self.me = null;
                self.ui.get_me('Nickname exists :( try again');
            break
            default:
                self.ui.error(e);
            break
        }
    });

    this.socket.on('error', function(e) {
        self.ui.error(e);
    });
    this.socket.on('connect_error', function(e) {
        self.ui.log('connect error: ' + e, 3);
        if (e.toString() != self.last_error) {
            self.ui.error({ error: 'Connection failed :( ', debug: e });
            self.last_error = e.toString();
        }
    });
    this.socket.on('connect_timeout', function(e) {
        self.ui.log('connect timeout: ' + e, 3);
        if (e.toString() != self.last_error) {
            self.ui.error({ error: 'Connection failed :( ', debug: e });
            self.last_error = e.toString();
        }
    });
    this.socket.on('reconnect_error', function(e) {
        self.ui.log('reconnect error ' + e, 3);
    });
    this.socket.on('reconnect', function() {
        self.last_error = null;
        self.client.join_channels();
    });
    this.socket.once('connect', function() {
        self.last_error = null;
        self.ui.status('Connected!', null, true);

        if (! self.crypto.browser_support.crypto.supported) {
            self.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
            self.ui.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
            return;
        }

    });
    this.socket.on('disconnect', function() {
        self.client.wipe_all_nickchains(); // bye bye nick keys
        self.ui.log('session keychain wiped on disconnect', 1);
        self.client.update_encrypt_state(self.ui.active_window().attr('windowname'));

        self.ui.status('Disconnected :(', null, true);
    });
}
