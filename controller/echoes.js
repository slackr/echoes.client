var $me = null;
var $ec = null;
var $ui = null;
var $session_id = null;

var $keychain = {};
var $keychain_pending = {};
var socket = null;

$(document).ready(function() {
    $ec = new EchoesCrypto();
    $ui = new EchoesUi();

    $ui.get_me();

    $(window).keydown(function(event) {
        if (! (event.ctrlKey
               || event.metaKey
               || event.altKey)) {
            if ($ui.ui.me.is(':visible')) {
                $ui.ui.me_input.focus();
            } else {
                $ui.ui.input.focus();
            }
        }

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
                $ui.status('Not connected!');
                return;
            }
            send_echo();
        }
    });
});

function send_echo() {
    var echo = $ui.ui.input.val();
    var split = echo.trim().split(' ');
    var to = $ui.active_window().attr('windowname');

    if (echo == '') {
        $ui.ui.input.focus();
        return;
    }

    if (split[0][0] == '/') {
        execute_command(split);
    } else {
        if ($ui.active_window().attr('encryptionstate') == 'encrypted') {
            execute_command(['/e', to, echo]);
        } else {
            socket.emit('/echo', { echo: echo, to: to });
        }
    }

    $ui.ui.input.val('');
    $ui.ui.input.focus();
}

function execute_command(params) {
    var command = params[0];
    params.shift();

    switch (command) {
        case '/clear':
            $ui.ui.echoes.html('');
        break;
        case '/e':
            var nick = params[0];
            params.shift();
            var eecho_plaintext = params.join(' ');

            send_encrypted_echo(nick, eecho_plaintext);
        break;
        case '/keyx':
            keyx_send_key(params[0]);
        break;
        default:
            socket.emit(command, params);
            $ui.log('sent unhandled command to server: ' + command + ' ' + params.join(' '));
        break
    }
}

function join_channels() {
    $ui.log('Auto-joining channels...', 1);
    $ui.joined_channels().each(function() {
        execute_command(['/join', $(this).attr('windowname')]);
    });
}

function keyx_new_key(to) {
    $ui.status('Generting new encryption key...');
    $ec.generate_keypair('encrypt').then(function() {
        $ui.log('key generated, exporting...');
        $ec.export_public_key('encrypt').then(function() {
            $ui.log('key exported.');
            keyx_send_key(to);
        })
    }).catch(function(e) {
        $ui.error('failed to generate key: ' + e.toString());
    });
}

function keyx_send_key(to) {
    if (typeof $ec == 'undefined'
        || $ec.jwk_exported_key == null) {
        $ui.log('generating new key...', 1);
        keyx_new_key(to);
        return;
    }

    $ui.log('found existing key, broadcasting...', 1);
    socket.emit('!keyx', {
        to: to,
        pubkey: $ec.jwk_exported_key
    });
}

function keyx_import(data) {
    var nick = data.from;
    var c = new EchoesCrypto();

    if (typeof $keychain[nick] == 'undefined') {
        $keychain[nick] = {};
    }

    c.import_jwk_key('encrypt', data.pubkey).then(function() {
        $keychain[nick].public_key = c.keychain.encrypt.imported.public_key;
        update_encrypt_state(nick);
        $ui.status('Imported encryption key from ' + nick);
        $ui.log('key import successful from: ' + nick);
    });
}

function update_encrypt_state(for_window) {
    var sent_decrypt_key = (typeof $keychain[for_window].keysent == 'undefined'
                            || $keychain[for_window].keysent != true
                            ) ? false : true;
    var received_encrypt_key = (typeof $keychain[for_window] == 'undefined'
                                || $keychain[for_window]['public_key'] == null) ? false : true;

    var state = 'unencrypted';
    if (received_encrypt_key && sent_decrypt_key) {
        state = 'encrypted';
    } else if (! received_encrypt_key || sent_decrypt_key) {
        state = 'oneway';
    }

    $ui.set_window_state(state, for_window);
    $ui.log('window ' + for_window + ' set to ' + state + ' s:' + sent_decrypt_key + ' r:' + received_encrypt_key);
}

function send_encrypted_echo(nick, echo) {
    if (typeof $keychain[nick] == 'undefined'
        || $keychain[nick]['public_key'] == null) {
        $ui.error("You do not have an encryption key for " + nick + ". A key exchange is required.");
        return;
    }

    var c = new EchoesCrypto();
    c.encrypt(echo, $keychain[nick].public_key).then(function() {
        var and_echoes = false;

        socket.emit('/echo', {
            type: 'encrypted',
            to: nick,
            echo: btoa(c.encrypted_data), // we could send object, but not all clients are written in js
        });

        if ($ui.get_window(nick).length == 0) {
            and_echoes = true;
        }
        $ui.echo($me + ' ))) [encrypted] ' + echo, nick, and_echoes);
    });
}
function decrypt_eecho(nick, echo) {
    if (typeof $ec == 'undefined'
        || $ec.keychain.encrypt.private_key == null) {
        $ui.error("Unable to decrypt echo from " + nick + ". No decryption key available.");
        return;
    }
    var and_echoes = false;

    var decoded_echo = atob(echo);
    var c = new EchoesCrypto();

    if ($ui.get_window(nick).length == 0) {
        and_echoes = true;
    }
    c.decrypt(decoded_echo, $ec.keychain.encrypt.private_key).then(function() {
        $ui.echo(nick + ' ))) [encrypted] ' + c.decrypted_data, nick, and_echoes);
    });
}

function init_socket() {
    var socket_query = encodeURI('session_id=' + $session_id + '&nickname=' + $me);

    socket = null;
    socket = io(AppConfig.WS_SERVER, {
        query: socket_query,
        forceNew: true,
    });

    setup_callbacks();

    $ui.log("connecting to " + AppConfig.WS_SERVER + "?" + socket_query + " as '" + $me + "' with session_id: " + $session_id, 1);
}

function setup_callbacks() {
    socket.on('*me', function(me) {
        $me = me;
        $ui.status('Hi ' + $me + ', say something or /join a channel', $ui.ui.echoes.attr('windowname'));

        execute_command(['/who']);
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

    socket.on('*ulist', function(list){
        $ui.clear_channels();

        for (var i in list.channels) {
            $ui.add_channel(list.channels[i]);
        }
    });
    socket.on('*list', function(list){
        $ui.status('Channel listing: ' + list.channels.join(', '), null, true);
    });
    socket.on('*who', function(who){
        $ui.clear_nicknames();
        for (var n in who.nicknames) {
            $ui.add_nickname(who.nicknames[n]);
        }
        $ui.status('Active nicknames: ' + who.nicknames.join(', '), null, true);
        $ui.ui.buttons.nicknames.click();
    });

    socket.on('*echo', function(echo){
        switch (echo.type) {
            case 'encrypted':
                $ui.log('eecho incoming: ' + echo.from + ': ' + JSON.stringify(echo), 0);
                decrypt_eecho(echo.from, echo.echo);
            break;

            case 'pm':
                if ($me != echo.from) {
                    $ui.add_window(echo.from);
                    $ui.echo(echo.from + ' ))) ' + echo.echo, echo.from);
                } // else passthru
            case 'all':
            case 'channel':
                $ui.echo(echo.from + ' ))) ' + echo.echo, echo.to);
            break;
        }
    });

    socket.on('*keyx', function(data){
        $ui.log('keyx incoming: ' + data.from + '@me' + ': ' + JSON.stringify(data), 0);
        keyx_import(data);
    });
    socket.on('*keyx_sent', function(data){
        if (typeof $keychain[data.to] == 'undefined') {
            $keychain[data.to] = {};
        }
        $keychain[data.to].keysent = true;

        update_encrypt_state(data.to);

        $ui.status('Encryption key sent to ' + data.to);
        $ui.log('keyx sent to: ' + data.to + ': ' + JSON.stringify(data), 0);
    });

    socket.on('*eecho_sent', function(data){
        $ui.log('eecho sent: ' + data.to + ': ' + JSON.stringify(data));
    });

    socket.on('*error', function(message){
        $ui.error(message, null, true);
        $ui.log(message, 3);
    });

    socket.on('error', function(e) {
        switch (e) {
            case 'invalid_nick':
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

    socket.on('connect_error', function() {
        console.log('connect error');
    });
    socket.on('reconnect_error', function() {
        console.log('reconnect error');
    });

    socket.on('reconnect', function() {
        join_channels();
    });
    socket.on('connect', function() {
        $ui.status('Connected!', null, true);
    });
    socket.on('disconnect', function() {
        $ui.status('Disconnected :(', null, true);
    });

    $ui.ui.buttons.encrypt.click(function() {
        var endpoint = $ui.active_window().attr('windowname');
        var current_state = $ui.get_window_state(endpoint);
        $ui.log('window current state: ' + current_state);
        switch (current_state) {
            case 'encrypted':
                var turnoff = confirm('Turn off encryption with ' + endpoint + '?');
                if (turnoff) {
                    delete $keychain[endpoint];
                    update_encrypt_state(endpoint);
                }
            break;
            case 'unencrypted':
                execute_command(['/keyx',endpoint]);
            break;
            case 'oneway':
                var resent = confirm('Key already sent to ' + endpoint + '. Resend?');
                if (resend) {
                    execute_command(['/keyx',endpoint]);
                }
            break;
        }
    });
}
