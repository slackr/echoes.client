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

$(document).ready(function() {
    $crypto = new EchoesCrypto();
    $ui = new EchoesUi();
    $client = new EchoesClient();
    $socket = new EchoesSocket();
    $storage = new EchoesStorage();
    $id = new EchoesIdentity();

    $storage.get_store();

    /**
     * Set controller cross references
     *
     * Socket reference for client object is set after initialization
     */
    $client.crypto = $crypto;
    $client.ui = $ui;
    $socket.client = $client;
    $socket.ui = $ui;
    $socket.crypto = $crypto;
    $id.ui = $ui;
    $id.crypto = $crypto;
    $id.storage = $storage;

    $crypto.does_browser_support('crypto');
    $crypto.does_browser_support('ec');

    /**
     * generate new key(s) if supported
     */
    if ($crypto.browser_support.crypto.supported) {
        $client.keyx_new_key(null, 'encrypt');

        if ($crypto.browser_support.ec.supported) {
            $client.keyx_new_key(null, 'keyx');
        }

        $id.load_identity(
            function(identity_data) {
                $me = identity_data.identity;
                $ui.ui.me_input.val($me);

                $id.auth_request(function(sid) {
                    $session_id = sid;
                    $ui.show_me('Ready to connect!');
                });
            },
            function() {
                $me = null;
                $id.ui.show_me('What do they call you?');
                $id.ui.ui.me_input.val('');
                $id.ui.ui.me_input.focus();
            }
        );
    } else {
        $id.ui.show_me('Unsupported client :( Try Chrome or Firefox!');
    }

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

        // on return keydown, if #me is visible, assume a new connection needs to be made
        if (event.which == 13) {
            if ($ui.ui.me.is(':visible')) {
                $me = $ui.ui.me_input.val();
                if (! $me) {
                    return;
                }

                $ui.status('Connecting...');

                $socket.me = $me;
                $socket.session_id = $session_id;

                $socket.initialize();
                $client.socket = $socket.socket; // set new ref to socket in client object

                $ui.hide_me();
                return;
            }

            if (! $socket.socket.connected) {
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

    /**
     * Set the callback for show_window() to update encryption state
     *
     * @param   {string} w  Windowname to update encryption state on
     *
     * @returns {null}
     */
    $ui.ui.show_window_callback = function(w) {
        $client.update_encrypt_state(w);
    }
});
