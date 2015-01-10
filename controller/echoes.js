var $me = null;
var $ec = null;
var $ui = null;

var $keychain = {};
var socket = null;

$(document).ready(function() {
    var session_id = null;
    $ec = new EchoesCrypto();
    $ui = new EchoesUi();

    get_me();

    $ui.log("connecting to " + ws_server + " as '" + $me + "' with session_id: " + session_id, 1);
    socket = io(AppConfig.WS_SERVER, {
        query: encodeURI('session_id=' + session_id + '&nickname=' + $me),
    });

    socket.on('error', function(e) {
        $ui.error(e);
    });
    socket.on('reconnect', function() {
        join_channels();
    });
    socket.on('connect', function() {
        $ui.status('Connected! Say something...');
    });
    socket.on('disconnect', function() {
        $ui.status('Disconnected :(');
    });

    $('form').submit(function(){
        try{
            send_echo();
        } catch (e) {
            $ui.log('fatal: ' + e.toString());
        }
        return false;
    });


    socket.on('*me', function(me) {
        $me = me;
        $ui.status('You are ' + $me);
    });

    socket.on('*join', function(join) {
        if (join.nickname == $me) {
            $("#c option[value='" + join.channel + "']").remove();
            $('#c').append(
                $('<option>')
                    .val(join.channel)
                    .html(join.channel)
                    .attr('selected', 'selected')
            );
        }

        $ui.status(join.nickname + ' joined ' + join.channel);
    });
    socket.on('*part', function(part) {
        if (part.nickname == $me) {
            $("#c option[value='" + part.channel + "']").remove();
        }
        $ui.status(part.nickname + ' parted ' + part.channel);
    });

    socket.on('*ulist', function(list){
        $('#c').html('');

        for (var i in list.channels) {
            $('#c').append(
                $('<option>')
                    .val(list.channels[i])
                    .html(list.channels[i])
            );
        }
    });
    socket.on('*list', function(list){
        $ui.status('Channel listing: ' + list.channels.join(', '));
    });
    socket.on('*who', function(who){
        $ui.status('Active nicknames: ' + who.nicknames.join(', '));
    });

    socket.on('*echo', function(echo){
        $ui.status(echo.nickname + ' ))) ' + (echo.channel ? echo.channel : '*') + ': ' + echo.echo);
    });

    socket.on('*keyx', function(data){
        $ui.log('keyx incoming: ' + data.from + '@me' + ': ' + JSON.stringify(data), 0);
        keyx_import(data);
    });
    socket.on('*keyx_sent', function(data){
        $ui.status('Encryption key sent to ' + data.to);
        $ui.log('keyx sent to: ' + data.to + ': ' + JSON.stringify(data), 0);
    });
    socket.on('*eecho', function(data){
        $ui.log('eecho incoming: ' + data.from + ': ' + JSON.stringify(data), 0);
        decrypt_eecho(data.from, data.echo);
    });
    socket.on('*eecho_sent', function(data){
        $ui.log('eecho sent: ' + data.to + ': ' + JSON.stringify(data));
    });

    socket.on('*error', function(message){
        $ui.error(message);
        $ui.log(message, 3);
    });

    $('form input').focus();
});

function send_echo() {
    if (! socket.connected) {
        $ui.status('Not connected!');
        return;
    }
    var echo = $('#e').val();
    var split = echo.trim().split(' ');
    var channel = $('#c option:selected').val();

    if (echo == '') {
        $ui.ui.input.focus();
        return;
    }

    if (split[0][0] == '/') {
        execute_command(split);
    } else {
        socket.emit('/echo', { echo: echo, channel: channel });
    }

    $('#e').val('');
    $('#e').focus();
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
            $ec.generate_keypair('encrypt').then(function() {
                $ui.log('Key generated, exporting...');
                $ec.export_public_key('encrypt').then(function() {
                    $ui.log('Key exported, sending broadcast...');
                    socket.emit('!keyx', {
                        to: params[0],
                        pubkey: $ec.jwk_exported_key
                    });
                })
            }).catch(function(e) {
                $ui.error('Failed to generate key: ' + e.toString());
            });;
        break;
        default:
            socket.emit(command, params);
            $ui.log('sent unhandled command to server: ' + command + ' ' + params.join(' '));
        break
    }
}

function join_channels() {
    var joined_channels = [];
    $ui.log('Auto-joining channels...', 1);
    $('#c option').each(function (){
        execute_command(['/join', $(this).val()]);
    });
}

function keyx_import(data) {
    var nick = data.from;
    var c = new EchoesCrypto();

    $keychain[nick] = {};

    c.import_jwk_key('encrypt', data.pubkey).then(function() {
        $keychain[nick].public_key = c.keychain.encrypt.imported.public_key;
        $ui.status('Imported encryption key from ' + nick);
        $ui.log('key import successful from: ' + nick);
    });
}

function send_encrypted_echo(nick, echo) {
    if (typeof $keychain[nick] == 'undefined'
        || $keychain[nick]['public_key'] == null) {
        $ui.error("You do not have an encryption key for " + nick + ". A key exchange is required.");
        return;
    }

    var c = new EchoesCrypto();
    c.encrypt(echo, $keychain[nick].public_key).then(function() {
        socket.emit('!eecho', {
            to: nick,
            echo: btoa(c.encrypted_data), // we could send object, but not all clients are written in js
        });
        $ui.echo($me + ' ))) ' + nick + ' [encrypted]: ' + echo);
    });
}
function decrypt_eecho(nick, echo) {
    if (typeof $ec == 'undefined'
        || $ec.keychain.encrypt.private_key == null) {
        $ui.error("Unable to decrypt echo from " + nick + ". No decryption key available.");
        return;
    }

    var decoded_echo = atob(echo);
    var c = new EchoesCrypto();
    c.decrypt(decoded_echo, $ec.keychain.encrypt.private_key).then(function() {
        $ui.echo(nick + ' ))) ' + $me + ' [encrypted]: ' + c.decrypted_data);
    });
}

function get_me() {
    while (! $me) {
        $me = prompt('What do they call you?');
    }
}
