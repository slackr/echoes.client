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

    /**
     * Socket.io client object
     */
    this.sio = null;

    /**
     * Controller object reference
     */
    this.client = null;

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
    this.client.ui.progress(10);
    if (! this.client.id.identity) {
        this.log('Nickname is null, abort init', 3);
        return;
    }

    var nickname = this.client.id.identity;
    var session_id = this.client.id.session_id;

    var socket_query = encodeURI('session_id=' + session_id + '&nickname=' + nickname);

    this.client.ui.progress(30);
    this.sio = null;
    this.sio = io(AppConfig.WS_SERVER, {
        query: socket_query,
        forceNew: true,
        multiplex: false,
        transports: AppConfig.ALLOWED_TRANSPORTS,
        autoConnect: true,
    });

    this.attach_socket_events();

    this.log("connecting to " + AppConfig.WS_SERVER + "?" + socket_query + " as '" + nickname + "' with session_id: " + session_id, 1);
};

/**
 * Attaches socket events to this.sio
 *
 * @returns {null}
 */
EchoesSocket.prototype.attach_socket_events = function() {
    var self = this;

    this.sio.on('*me', function(me) {
        self.client.auto_join_channels();
        self.client.ui.progress(101);
        self.client.ui.status('Hi ' + self.client.id.identity + ', /join a channel and say something!', self.client.ui.ui.echoes.attr('windowname'));
    });

    this.sio.on('*pm', function(nick) {
        self.client.ui.add_window(nick, 'nickname');
        self.client.ui.ui.lists.windows.find('li[windowname="' + nick + '"]').click();
        self.client.ui.progress(50);
    });

    this.sio.on('*join', function(join) {
        var chan = join.channel;
        var nick = join.nickname;

        if (nick == self.client.id.identity) {
            self.client.ui.add_window(chan, 'channel');
            self.client.execute_command(['/who', chan]);
            self.client.ui.show_window(chan);
        } else {
            var nicklist = self.client.ui.get_window(chan).find('ul:first');
            nicklist.find('li[nickname="' + nick + '"]').remove();
            nicklist.append(
                $('<li>')
                    .attr('nickname', nick)
            );
            self.client.ui.refresh_nicklist(chan);
        }

        self.client.ui.status((nick == self.client.id.identity ? 'You have' : nick) + ' joined ' + chan, chan);
    });
    this.sio.on('*part', function(part) {
        var chan = part.channel;
        var nick = part.nickname;
        var reason = part.reason;
        var and_echoes = false;

        var nicklist = self.client.ui.get_window(chan).find('ul:first');
        nicklist.find('li[nickname="' + nick + '"]').remove();

        if (nick == self.client.id.identity) {
            self.client.ui.remove_channel(chan);

            if (self.client.ui.active_window().attr('windowname') == chan) {
                self.client.ui.show_window(self.client.ui.ui.echoes.attr('windowname'));
                and_echoes = true;
            }
        } else {
            self.client.ui.refresh_nicklist(chan);
        }

        self.client.ui.status((nick == self.client.id.identity ? 'You have' : nick) + ' parted ' + chan + (reason ? ' (' + reason + ')' : ''), chan, and_echoes);
    });

    this.sio.on('*ulist', function(list) {
        self.client.ui.clear_channels();

        for (var i in list.channels) {
            self.client.ui.add_window(list.channels[i], 'channel');
        }
    });
    this.sio.on('*list', function(list){
        self.client.ui.status('Channel listing: ' + list.channels.join(', '), null, true);
    });
    this.sio.on('*who', function(who) {
        var nicks = who.nicknames;
        var chan = who.channel;
        var nicklist = self.client.ui.get_window(chan).find('ul:first');

        nicklist.html('');
        for (var n in nicks) {
            nicklist.append(
                $('<li>')
                    .attr('nickname', nicks[n])
            );
        }

        self.client.ui.refresh_nicklist(chan);
        self.client.ui.status("Who's in " + chan + "? "  + nicks.join(', '), chan, true);
    });
    this.sio.on('*connect', function(who) {
        var nick = who.nickname;

        self.client.ui.status(nick + ' connected!', nick, true);
    });
    this.sio.on('*disconnect', function(who) {
        var nick = who.nickname;

        self.client.ui.ui.lists.windows.find('li').each(function() {
            var window_name = $(this).attr('windowname');
            var window_object = self.client.ui.get_window(window_name);

            switch (window_object.attr('windowtype')) {
                case 'channel':
                    var nicklist = window_object.find('ul:first');
                    var nicks_found = nicklist.find('li[nickname="' + nick + '"]');
                    if (nicks_found.length > 0) {
                        nicks_found.remove();
                        self.client.ui.status(nick + ' disconnected!', window_name, false);
                    }
                break;
                case 'nickname':
                    self.client.ui.status(nick + ' disconnected!', window_name, false);
                break;
                default:
                    self.client.ui.status(nick + ' disconnected!', self.client.ui.ui.echoes.attr('windowname'), false);
                break;
            }
        });
        self.client.ui.remove_nickname(nick);

        if (self.client.get_nickchain_property(nick, 'symkey')
            || self.client.get_nickchain_property(nick, 'public_key')) {
            self.client.keyx_off(nick, false);
        }
    });

    this.sio.on('*echo', function(echo) {
        switch (echo.type) {
            case 'encrypted':
                self.client.ui.add_window(echo.from, 'nickname');
                self.log('eecho incoming: ' + echo.from + ': ' + JSON.stringify(echo), 0);
                self.client.decrypt_encrypted_echo(echo.from, echo.echo);
            break;

            case 'pm':
                self.client.ui.add_window(echo.from, 'nickname');
                self.client.ui.echo({
                    type: 'in',
                    echo: echo.echo,
                    window: echo.from,
                    nick: echo.from,
                    broadcast: false,
                });
            break;
            case 'all':
            case 'channel':
                self.client.ui.echo({
                    type: 'in',
                    echo: echo.echo,
                    window: echo.to,
                    nick: echo.from,
                    broadcast: false,
                });
            break;
        }
    });

    this.sio.on('*keyx', function(data){
        self.log('keyx incoming: ' + data.from + '@me' + ': ' + JSON.stringify(data), 0);

        if (typeof data.keychain != 'undefined'
            && data.keychain == 'keyx'
            && ! self.client.crypto.browser_support.ec.supported) {
            self.sio.emit('!keyx_unsupported', {
                to: data.from
            });
            self.log('keyx method not supported, sending back notification', 3);
            return;
        }

        self.client.ui.add_window(data.from, 'nickname');
        self.client.keyx_import(data);
    });
    this.sio.on('*keyx_unsupported', function(data){
        var nick = data.from;
        self.log('keyx_unsupported incoming from: ' + nick, 0);
        self.client.keyx_off(nick, false); // do not emit another !keyx_off

        self.client.ui.status('Key type not supported, falling back...', nick, true);

        self.client.set_nickchain_property(nick, { keychain: 'asym' });
        self.client.keyx_send_key(nick);
    });
    this.sio.on('*keyx_off', function(data){
        var nick = data.from;
        self.log('keyx_off incoming from: ' + nick, 0);
        self.client.keyx_off(nick, false); // do not emit another !keyx_off
    });
    this.sio.on('*keyx_sent', function(data){
        self.client.ui.progress(101);

        var nick = data.to;

        self.client.set_nickchain_property(nick, {
            keysent: true,
        });

        self.client.update_encrypt_state(nick);

        self.client.ui.status('Public key sent to ' + nick + ' (' + self.client.crypto.keychain[self.client.get_nickchain_property(nick, 'keychain')].exported.hash + ')', nick, true);
        self.log('keyx sent to: ' + nick + ': ' + JSON.stringify(data), 0);
    });

    this.sio.on('*eecho_sent', function(data){
        self.client.ui.progress(101);
        self.log('eecho sent: ' + data.to + ': ' + JSON.stringify(data), 0);
    });

    this.sio.on('*error', function(message){
        self.client.ui.error(message, null, true);
        self.log(message, 3);
        self.client.ui.progress(101);
    });
    this.sio.on('*fatal', function(e) {
        self.log('fatal! ' + e, 3);
        switch (e) {
            case 'nick_exists':
                self.client.ui.popup('Error', 'Nickname already connected! Please disconnect other clients first.', 'RETRY', null, function() {
                    self.client.connect();
                });
            break;
            case 'nick_invalid':
                self.client.ui.popup('Error', 'Nickname is invalid :( Please try again', 'RETRY', 'NEW IDENTITY', function() {
                    self.client.connect();
                }, function() {
                    self.client.register_show();
                });
            break;
            case 'auth_invalid_session':
                self.client.ui.popup('Error', 'Invalid session for ' + self.client.id.identity + '. Please log in again!', 'RETRY', 'NEW IDENTITY', function() {
                    self.client.connect();
                }, function() {
                    self.client.register_show();
                });
            break;
            case 'auth_http_error':
                self.client.ui.popup('Error', 'Server failed to verify identity for ' + self.client.id.identity + '. Please try again later', 'RETRY', 'NEW IDENTITY', function() {
                    self.client.connect();
                }, function() {
                    self.client.register_show();
                });
            break;
            default:
                self.client.ui.popup('Error', 'Server replied with an unknown error: ' + e + '. Please try again later', 'RETRY', 'NEW IDENTITY', function() {
                    self.client.connect();
                }, function() {
                    self.client.register_show();
                });
            break;
        }
        self.client.ui.progress(101);
    });

    this.sio.on('error', function(e) {
        self.client.ui.error(e);
        self.client.ui.progress(101);
    });
    this.sio.on('connect_error', function(e) {
        self.log('connect error: ' + e, 3);
        if (e.toString() != self.last_error) {
            self.client.ui.error({ error: 'Connection failed :( ', debug: e }, null, true);
            self.last_error = e.toString();
        }
        self.client.ui.progress(101);
    });
    this.sio.on('connect_timeout', function(e) {
        self.log('connect timeout: ' + e, 3);
        if (e.toString() != self.last_error) {
            self.client.ui.error({ error: 'Connection failed :( ', debug: e }, null, true);
            self.last_error = e.toString();
        }
        self.client.ui.progress(101);
    });
    this.sio.on('reconnect_error', function(e) {
        self.log('reconnect error ' + e, 3);
        self.client.ui.progress(101);
    });
    this.sio.on('reconnect', function() {
        self.last_error = null;
        self.client.ui.status('Reconnected!', null, true);
        self.client.ui.progress(101);
    });
    this.sio.once('connect', function() {
        self.last_error = null;
        self.client.ui.status('Connected!', null, true);

        if (! self.client.crypto.browser_support.crypto.supported) {
            self.client.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
            self.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
            return;
        }

        self.client.ui.progress(101);
    });
    this.sio.on('disconnect', function() {
        self.client.wipe_all_nickchains(); // bye bye nick keys
        self.log('session keychain wiped on disconnect', 1);
        self.client.update_encrypt_state(self.client.ui.active_window().attr('windowname'));

        self.client.ui.status('Disconnected :(', null, true);
        self.client.ui.progress(101);
    });

    this.client.ui.progress(50);
};
