/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * require('../lib/config.js'); //AppConfig
 * require('../lib/object.js'); //EchoesObject
 * require('../lib/crypto.js'); //EchoesCrypto
 */

/**
 * @type string The nickname assigned to active connection
 */
var $me = null;

/**
 * @type EchoesCrypto Global crypto object
 */
var $crypto = null;

/**
 * @type EchoesClient Global client object
 */
var $client = null;

/**
 * @type EchoesUi Global UI object
 */
var $ui = null;

/**
 * @type string Session ID to pass to server for verification
 */
var $session_id = null;

/**
 * @type string Store last connect/reconnect error from socket.io
 */
var $last_error = null;

/**
 * @type Object A hash of nicknames and their imported keys/symkeys
 */
var $keychain = {};

/**
 * @type Socket Socket.io main global object
 */
var socket = null;

$(document).ready(function() {
    $crypto = new EchoesCrypto();
    $ui = new EchoesUi();
    $client = new EchoesClient(socket, $ui, $crypto);

    $crypto.does_browser_support('crypto');
    $crypto.does_browser_support('ec');

    $ui.get_me();

    $(window).keydown(function(event) {
        // change input focus depending on what window is visible
        if (! (event.ctrlKey
               || event.metaKey
               || event.altKey)) {
            if ($ui.ui.me.is(':visible')) {
                $ui.ui.me_input.focus();
            } else {
                $ui.ui.input.focus();
            }
        }

        // on return keydown, if me_input is visible, assume a new connection needs to be made
        if (event.which == 13) {
            if ($ui.ui.me.is(':visible')) {
                $me = $ui.ui.me_input.val();
                if (! $me) {
                    return;
                }

                init_socket();
                $ui.hide_me();
                return;
            }

            if (! socket.connected) {
                $ui.error('Not connected :(');
                return;
            }
            
            $client.send_echo();
        }
    });

    $ui.ui.buttons.encrypt.click(function() {
        var endpoint = $ui.active_window().attr('windowname');
        var current_state = $ui.get_window_state(endpoint);
        $ui.log('window current encryption state: ' + current_state, 0);
        switch (current_state) {
            case 'encrypted':
                var turnoff = confirm('Turn off encryption for ' + endpoint + '?');
                if (turnoff) {
                    $client.execute_command(['/keyx_off', endpoint]);
                }
            break;
            case 'unencrypted':
            case 'oneway':
                $client.execute_command(['/keyx', endpoint]);
            break;
        }
    });
});

function keyx_derive_key(nick, private_key, public_key) {
    if (! private_key || ! public_key) {
        $ui.log('keyx symkey derivation skipped, pub: ' + public_key + ', priv: ' + private_key, 2);
        return;
    }

    var c = new EchoesCrypto();

    c.derive_key(private_key, public_key).then(function() {
        $ui.set_keychain_property(nick, {
            symkey: c.derived_key,
        });

        $ui.update_encrypt_state(nick);

        $ui.status('Successfully derived symkey for ' + nick);
        $ui.log('symkey derived for: ' + nick, 0);
    }).catch(function(e){
        delete $keychain[nick];
        $ui.update_encrypt_state(nick);

        $ui.error({ error: 'Failed to generate encryption key for ' + nick, debug: e.toString() });
        $ui.log('derive: ' + e.toString(), 3);
    });
}

function keyx_new_key(endpoint, kc) {
    if (! $crypto.browser_support.crypto.supported) {
        $ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        $ui.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    $ui.status('Generting new session keys...');
    $ui.log('generating new ' + kc + ' session keypair...', 0);

    $crypto.generate_key(kc).then(function() {
        $ui.log(kc + ' keypair generated, exporting...', 0);
        return $crypto.export_key(kc + '_public').then(function() {
            $ui.log(kc + ' public key exported successfully', 0);

            return $crypto.hash($crypto.keychain[kc].exported.public_key).then(function() {
                $crypto.keychain[kc].exported.hash = $crypto.resulting_hash.match(/.{1,8}/g).join(' ');
                if (typeof endpoint != 'undefined') {
                    $ui.log('sending ' + kc + ' public key to endpoint: ' + endpoint, 0);
                    keyx_send_key(endpoint);
                }
            }).catch(function(e) {
                $ui.error('Failed to hash exported ' + kc + ' key: ' + e.toString());
            });
        }).catch(function(e) {
            $ui.error('Failed to export key: ' + e.toString());
        });
    }).catch(function(e) {
        $ui.error('Failed to generate keypair: ' + e.toString());
    });
}

function keyx_send_key(endpoint) {
    if (! $crypto.browser_support.crypto.supported) {
        $ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        $ui.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    var kc = $ui.get_keychain_property(endpoint, 'keychain') || ($crypto.browser_support.ec.supported ? 'keyx' : 'encrypt');

    if (typeof $crypto == 'undefined'
        || $crypto.keychain[kc].public_key == null) {
        keyx_new_key(endpoint, kc);
        return;
    }

    $ui.set_keychain_property(endpoint, { keychain: kc });

    $ui.log('found existing ' + kc + ' keypair, broadcasting...', 0);
    socket.emit('!keyx', {
        to: endpoint,
        pubkey: btoa($crypto.keychain[kc].exported.public_key),
        keychain: kc,
    });
}

function keyx_off(endpoint, inform_endpoint) {
    inform_endpoint = inform_endpoint || false;

    delete $keychain[endpoint];
    $ui.update_encrypt_state(endpoint);

    if (inform_endpoint) {
        socket.emit('!keyx_off', {
            to: endpoint
        });
    }
}

function keyx_import(data) {
    if (! $crypto.browser_support.crypto.supported) {
        $ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        $ui.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    var nick = data.from;
    var kc = data.keychain;
    var key = atob(data.pubkey);
    var c = new EchoesCrypto();

    c.import_key(kc, key, 'spki').then(function() {
        return c.hash(key).then(function() {
            $ui.set_keychain_property(nick, {
                public_key: c.keychain[kc].imported.public_key,
                hash: c.resulting_hash.match(/.{1,8}/g).join(' '),
                keychain: kc,
            });

            if (kc == 'keyx') {
                keyx_derive_key(nick, $crypto.keychain[kc].private_key, $ui.get_keychain_property(nick, 'public_key'));
            }

            $ui.status('Imported ' + kc + ' public key from ' + nick + ' (' + $keychain[nick].hash + ')');
            $ui.log(kc + ' pubkey import successful from: ' + nick + ' (' + $keychain[nick].hash + ')', 0);
        }).catch(function(e) {
            delete $keychain[nick];
            $ui.update_encrypt_state(nick);

            $ui.error({ error: 'Failed to import key from ' + nick, debug: kc + ': ' + e.toString() });
            $ui.log('hash: ' + e.toString(), 3);
        })
    }).catch(function(e) {
        delete $keychain[nick];
        $ui.update_encrypt_state(nick);

        $ui.error({ error: 'Failed to import key from ' + nick, debug: kc + ': ' +  e.toString() });
        $ui.log('import key: ' + e.toString(), 3);
    });
}

function send_encrypted_echo(nick, echo) {
    if (! $crypto.browser_support.crypto.supported) {
        $ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        $ui.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    if ($ui.get_keychain_property(nick, 'public_key') == null) {
        $ui.error("You do not have a public key for " + nick + ". Initiate a key exchange first.");
        return;
    }

    var c = new EchoesCrypto();
    c.encrypt(echo, $keychain[nick].public_key, $ui.get_keychain_property(nick, 'symkey')).then(function() {
        var and_echoes = false;

        socket.emit('/echo', {
            type: 'encrypted',
            to: nick,
            echo: c.encrypted_segments, // an array of base64 encoded segments
        });

        if ($ui.get_window(nick).length == 0) {
            and_echoes = true;
        }
        $ui.echo($me + ' ))) [encrypted] ' + echo, nick, and_echoes);
    }).catch(function(e) {
        $ui.error({ error: 'Encrypt operation failed on echo to ' + nick, debug: e.toString() });
    });
}
function decrypt_eecho(nick, echo) { // echo is an array of b64 encoded segments
    if (! $crypto.browser_support.crypto.supported) {
        $ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        $ui.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    var kc = $ui.get_keychain_property(nick, 'keychain');
    if (typeof $crypto == 'undefined'
        || kc == null
        || ($crypto.keychain[kc].private_key == null
            && $ui.get_keychain_property(nick, 'symkey') == null)) {
        $ui.error("Unable to decrypt echo from " + nick + ". No decryption key available.");
        return;
    }
    if (typeof echo != 'object'
        || echo.length == 0) {
        $ui.log('invalid encrypted echo from ' + nick + ': ' + typeof echo, 3);
        $ui.error("Could not decrypted echo from " + nick + ". It appears invalid.");
        return;
    }

    var c = new EchoesCrypto();

    $ui.add_nickname(nick);
    c.decrypt(echo, $crypto.keychain[kc].private_key, $ui.get_keychain_property(nick, 'symkey')).then(function() {
        $ui.echo(nick + ' ))) [encrypted] ' + c.decrypted_text, nick, false);
    }).catch(function(e) {
        $ui.error({ error: 'Decrypt operation fail on echo from ' + nick, debug: kc + ': ' + e.toString() });
    });
}

function init_socket() {
    var socket_query = encodeURI('session_id=' + $session_id + '&nickname=' + $me);

    $ui.status('Connecting...');

    socket = null;
    socket = io(AppConfig.WS_SERVER, {
        query: socket_query,
        forceNew: true,
        multiplex: false,
        transports: AppConfig.ALLOWED_TRANSPORTS,
        autoConnect: true,
    });

    setup_callbacks();

    $client.socket = socket;
    $ui.log("connecting to " + AppConfig.WS_SERVER + "?" + socket_query + " as '" + $me + "' with session_id: " + $session_id, 1);
}

function setup_callbacks() {
    socket.on('*me', function(me) {
        $me = me;
        $ui.status('Hi ' + $me + ', say something or /join a channel', $ui.ui.echoes.attr('windowname'));

        $client.execute_command(['/who']);
    });

    socket.on('*pm', function(nick) {
        $ui.add_nickname(nick);
        $ui.ui.lists.nicknames.find('li[windowname="' + nick + '"]')
            .click();
    });

    socket.on('*join', function(join) {
        var chan = join.channel;
        var nick = join.nickname;

        if (nick == $me) {
            $ui.add_channel(chan);
            $ui.show_window(chan);
        }

        $ui.status((nick == $me ? 'You have' : nick) + ' joined ' + chan, chan);
    });
    socket.on('*part', function(part) {
        var chan = part.channel;
        var nick = part.nickname;
        var reason = part.reason;
        var and_echoes = false;

        if (nick == $me) {
            $ui.remove_channel(chan);
            $ui.show_window($ui.ui.echoes.attr('windowname'));
            and_echoes = true;
        }
        $ui.status((nick == $me ? 'You have' : nick) + ' parted ' + chan + (reason ? ' (' + reason + ')' : ''), chan, and_echoes);
    });

    socket.on('*ulist', function(list) {
        $ui.clear_channels();

        for (var i in list.channels) {
            $ui.add_channel(list.channels[i]);
        }
    });
    socket.on('*list', function(list){
        $ui.status('Channel listing: ' + list.channels.join(', '), null, true);
    });
    socket.on('*who', function(who) {
        $ui.clear_nicknames();
        for (var n in who.nicknames) {
            $ui.add_nickname(who.nicknames[n]);
        }

        $ui.status("Who's online? " + who.nicknames.join(', '), null, true);
        if (who.nicknames.length > 1 && ! $ui.ui.lists.nicknames.is(':visible')) {
            $ui.ui.buttons.nicknames.click();
        }
    });
    socket.on('*connect', function(who) {
        $ui.add_nickname(who.nickname);
        $ui.status(who.nickname + ' connected!', who.nickname, true);
    });
    socket.on('*disconnect', function(who) {
        $ui.remove_nickname(who.nickname);
        keyx_off(who.nickname, false);
        $ui.status(who.nickname + ' disconnected!', who.nickname, true);
    });

    socket.on('*echo', function(echo) {
        switch (echo.type) {
            case 'encrypted':
                $ui.log('eecho incoming: ' + echo.from + ': ' + JSON.stringify(echo), 0);
                decrypt_eecho(echo.from, echo.echo);
            break;

            case 'pm':
                $ui.add_window(echo.from, 'nickname');
                $ui.echo(echo.from + ' ))) ' + echo.echo, echo.from);
            break;
            case 'all':
            case 'channel':
                $ui.echo(echo.from + ' ))) ' + echo.echo, echo.to);
            break;
        }
    });

    socket.on('*keyx', function(data){
        $ui.log('keyx incoming: ' + data.from + '@me' + ': ' + JSON.stringify(data), 0);

        if (typeof data.keychain != 'undefined'
            && data.keychain == 'keyx'
            && ! $crypto.browser_support.ec.supported) {
            socket.emit('!keyx_unsupported', {
                to: data.from
            });
            $ui.log('keyx method not supported, sending back notification', 3);
            return;
        }

        keyx_import(data);
    });
    socket.on('*keyx_unsupported', function(data){
        $ui.log('keyx_unsupported incoming from: ' + data.from, 0);
        keyx_off(data.from, false); // do not emit another !keyx_off

        $ui.status('Key rejected, falling back...');

        $ui.set_keychain_property(data.from, { keychain: 'encrypt' });
        keyx_send_key(data.from);
    });
    socket.on('*keyx_off', function(data){
        $ui.log('keyx_off incoming from: ' + data.from, 0);
        keyx_off(data.from, false); // do not emit another !keyx_off
    });
    socket.on('*keyx_sent', function(data){
        var nick = data.to;

        $ui.set_keychain_property(nick, {
            keysent: true,
        });

        if (data.keychain == 'keyx') {
            keyx_derive_key(nick, $crypto.keychain[data.keychain].private_key, $ui.get_keychain_property(nick, 'public_key'));
        }

        $ui.update_encrypt_state(nick);

        $ui.status('Public key sent to ' + nick + ' (' + $crypto.keychain[$ui.get_keychain_property(nick, 'keychain')].exported.hash + ')');
        $ui.log('keyx sent to: ' + nick + ': ' + JSON.stringify(data), 0);
    });

    socket.on('*eecho_sent', function(data){
        $ui.log('eecho sent: ' + data.to + ': ' + JSON.stringify(data), 0);
    });

    socket.on('*error', function(message){
        $ui.error(message, null, true);
        $ui.log(message, 3);
    });
    socket.on('*fatal', function(e) {
        $ui.log('fatal! ' + e, 3);
        switch (e) {
            case 'nick_invalid':
                $me = null;
                $ui.get_me('Bad nickname :( try again');
            break;
            case 'nick_exists':
                $me = null;
                $ui.get_me('Nickname exists :( try again');
            break
            default:
                $ui.error(e);
            break
        }
    });

    socket.on('error', function(e) {
        $ui.error(e);
    });
    socket.on('connect_error', function(e) {
        $ui.log('connect error: ' + e, 3);
        if (e.toString() != $last_error) {
            $ui.error({ error: 'Connection failed :( ', debug: e });
            $last_error = e.toString();
        }
    });
    socket.on('connect_timeout', function(e) {
        $ui.log('connect timeout: ' + e, 3);
        if (e.toString() != $last_error) {
            $ui.error({ error: 'Connection failed :( ', debug: e });
            $last_error = e.toString();
        }
    });
    socket.on('reconnect_error', function(e) {
        $ui.log('reconnect error ' + e, 3);
    });

    socket.on('reconnect', function() {
        $last_error = null;
        $client.join_channels();
    });
    socket.once('connect', function() {
        $last_error = null;
        $ui.status('Connected!', null, true);

        if (! $crypto.browser_support.crypto.supported) {
            $ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
            $ui.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
            return;
        }

    });
    socket.on('disconnect', function() {
        $keychain = {}; // bye bye nick keys
        $ui.log('session keychain wiped on disconnect', 1);
        $ui.update_encrypt_state($ui.active_window().attr('windowname'));

        $ui.status('Disconnected :(', null, true);
    });
}
