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
 * @type EchoesClient Global client object
 */
var $client = null;

$(document).ready(function() {
    $client = new EchoesClient();

    /**
     * Set controller references
     */
    $client.crypto = new EchoesCrypto();
    $client.ui = new EchoesUi();
    $client.id = new EchoesIdentity();
    $client.id.storage = new EchoesStorage();
    $client.socket = new EchoesSocket();

    /**
     * Client controller cross reference
     */
    $client.socket.client = $client;
    $client.id.client = $client;

    $client.id.storage.get_store();
    $client.crypto.does_browser_support('crypto');
    $client.crypto.does_browser_support('ec');

    $.ajaxSetup({ // csp on openwebapp
        xhr: function() {
            return new window.XMLHttpRequest({
               mozSystem: true
            });
        }
    });

    /**
     * authenticate and generate new key(s) if crypto is supported
     */
    if ($client.crypto.browser_support.crypto.supported) {
        $client.ui.progress(10);
        $client.id.load_identity().then(function() {
            $client.ui.progress(30);
            $client.connect();
        }).catch(function(e) {
            $client.id.device = $client.crypto.bytes_to_hex($client.crypto.new_iv(32));

            $client.ui.popup('Identity', e, 'NEW', 'RECOVER',
                function() {
                    $client.register_show();
                },
                function() {
                    $client.recovery_show();
                });
        });

        $client.keyx_new_key(null, 'asym');
        if ($client.crypto.browser_support.ec.supported) {
            $client.keyx_new_key(null, 'keyx');
        }

    } else {
        $client.ui.popup('Error', 'Unsupported client :( Try the latest Chrome or Firefox!', 'OK, I WILL', null, function() {
            return false;
        });
    }

    $(window).keydown(function(event) {
        // change input focus depending on what window is visible
        if (! (event.ctrlKey
               || event.metaKey
               || event.altKey
               || $client.ui.ui.popup.window.is(':visible'))) {
            $client.ui.ui.input.focus();
        }

        // on return keydown
        if (event.which == 13) {
            if ($client.ui.ui.popup.window.is(':visible')) {
                if ($client.ui.ui.popup.yes.is(':visible')) {
                    $client.ui.ui.popup.yes.click();
                    return;
                } else if ($client.ui.ui.popup.no.is(':visible')) {
                    $client.ui.ui.popup.no.click();
                    return;
                } else {
                    $client.ui.popup_close();
                    return;
                }
            }

            $client.ui.ui.buttons.send.click();
        }
    });


    $client.ui.ui.buttons.exit.click(function() {
        $client.execute_command(['/exit']);
    });

    $client.ui.ui.buttons.send.click(function() {
        $client.send_echo();
    });

    $client.ui.ui.buttons.encrypt.click(function() {
        if (! $client.is_connected()) {
            $client.ui.error('Not connected :(');
            return;
        }

        var endpoint = $client.ui.active_window().attr('windowname');
        var current_state = $client.ui.get_window_state(endpoint);
        $client.ui.log('window current encryption state: ' + current_state, 0);
        switch (current_state) {
            case 'encrypted':
                $client.ui.popup('Encryption', 'Turn off encryption for ' + endpoint + '?', 'YES', 'NO', function() {
                    $client.execute_command(['/keyx_off', endpoint]);
                    $client.ui.popup_close();
                });
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
    $client.ui.ui.show_window_callback = function(w) {
        $client.update_encrypt_state(w);
    };
});
