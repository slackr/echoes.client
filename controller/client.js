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
function EchoesClient() {
    EchoesObject.call(this, 'socket');

    this.socket = null; // socket.io object ref
    this.ui = null; // ui object ref
    this.crypto = null; // crypto object ref

    /**
     * @type Object A hash of nicknames and their imported keys/symkeys and keysent status
     */
    this.nickchain = {};

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

            this.send_encrypted_echo(nick, plaintext);
        break;
        case '/keyx':
            this.keyx_send_key(params[0]);
        break;
        case '/keyx_off':
            this.keyx_off(params[0], true);
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

/**
 * (async) Derive a symmetric key using two CryptoKey objects
 *
 * If either public/private key parameters are null, derivation is aborted
 *
 * @param   {string} nick           Which nick's keystore to use
 * @param   {CryptoKey} private_key Object representing a private key
 * @param   {CryptoKey} public_key  Object representing a public key
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_derive_key = function(nick, private_key, public_key) {
    if (! private_key || ! public_key) {
        this.ui.log('keyx symkey derivation skipped, pub: ' + public_key + ', priv: ' + private_key, 2);
        return;
    }
    var self = this;
    var c = new EchoesCrypto();

    c.derive_key(private_key, public_key).then(function() {
        self.set_nickchain_property(nick, {
            symkey: c.derived_key,
        });

        self.update_encrypt_state(nick);

        self.ui.status('Successfully derived symkey for ' + nick);
        self.log('symkey derived for: ' + nick, 0);
    }).catch(function(e){
        self.wipe_nickchain(nick);
        self.update_encrypt_state(nick);

        self.ui.error({ error: 'Failed to generate encryption key for ' + nick, debug: e.toString() });
        self.log('derive: ' + e.toString(), 3);
    });
}

/**
 * (async) Decrypt incoming eecho
 *
 * @param   {string} nick   Nickname that sent the echo
 * @param   {Array} echo    Array of encrypted segments
 *
 * @returns {null}
 */
EchoesClient.prototype.decrypt_encrypted_echo = function(nick, echo) { // echo is an array of b64 encoded segments
    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    var kc = this.get_nickchain_property(nick, 'keychain');
    if (typeof this.crypto == 'undefined'
        || kc == null
        || (this.crypto.keychain[kc].private_key == null
            && this.get_nickchain_property(nick, 'symkey') == null)) {
        this.ui.error("Unable to decrypt echo from " + nick + ". No decryption key available.");
        return;
    }
    if (typeof echo != 'object'
        || echo.length == 0) {
        this.ui.log('invalid encrypted echo from ' + nick + ': ' + typeof echo, 3);
        this.ui.error("Could not decrypt echo from " + nick + ". It appears invalid.");
        return;
    }

    var self = this;
    var c = new EchoesCrypto();

    this.ui.add_nickname(nick);
    c.decrypt(echo, this.crypto.keychain[kc].private_key, this.get_nickchain_property(nick, 'symkey')).then(function() {
        self.ui.echo(nick + ' ))) [encrypted] ' + c.decrypted_text, nick, false);
    }).catch(function(e) {
        self.ui.error({ error: 'Decrypt operation failed on echo from ' + nick, debug: kc + ': ' + e.toString() });
    });
}

/**
 * (async) Encrypt and send echo to a nickname
 *
 * '/echo' is emitted to server bypassing execute_command
 * emit data = { type: 'encrypted', to: 'nick', echo: 'array of segments' }
 *
 * @param   {string} nick   Nickname to send eecho to
 * @param   {string} echo   Text to encrypt and send
 *
 * @returns {null}
 */
EchoesClient.prototype.send_encrypted_echo = function(nick, echo) {
    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    if (this.get_nickchain_property(nick, 'public_key') == null
        && this.get_nickchain_property(nick, 'symkey') ==  null) {
        this.ui.error("You do not have a decryption key for " + nick + ". Initiate a key exchange first.");
        this.log('no encryption key found in nickchain: ' + nick, 3);
        return;
    }

    var self = this;
    var c = new EchoesCrypto();

    c.encrypt(echo, this.get_nickchain_property(nick, 'public_key'), this.get_nickchain_property(nick, 'symkey')).then(function() {
        var and_echoes = false;

        self.socket.emit('/echo', { // bypass execute_command for encrypted echoes, we'll write it on wall manually below
            type: 'encrypted',
            to: nick,
            echo: c.encrypted_segments, // an array of base64 encoded segments
        });

        if (self.ui.get_window(nick).length == 0) {
            and_echoes = true;
        }
        self.ui.echo($me + ' ))) [encrypted] ' + echo, nick, and_echoes);
    }).catch(function(e) {
        self.ui.error({ error: 'Encrypt operation failed on echo to ' + nick, debug: e.toString() });
    });
}

/**
 * Turn off encryption for an endpoint
 *
 * Will wipe nickchain and inform endpoint encryption has been turned off if second param is true
 *
 * !keyx_off is emitted to server IF second param is true, using { to: 'nick' }
 *
 * @param   {string} function       Endpoint to turn off encryption/keyx on
 * @param   {bool} inform_endpoint  (default='false') Send a keyx_off message to server to inform endpoint?
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_off = function(endpoint, inform_endpoint) {
    inform_endpoint = inform_endpoint || false;

    this.wipe_nickchain(endpoint);
    this.update_encrypt_state(endpoint);

    if (inform_endpoint) {
        this.socket.emit('!keyx_off', {
            to: endpoint
        });
    }
}

/**
 * (async) Import keyx data from server
 *
 * Marked as async because key derivation for keyx is asynchronous (i should fix this)
 * Right now this function assumes it's public and will use 'spki' as the type
 *
 * data = { from: 'nick', keychain: 'keyx|encrypt', pubkey: 'base64 encoded PEM pubkey' }
 *
 * @param   {object} data Object of keyx data to process
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_import = function(data) {
    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    var self = this;
    var nick = data.from;
    var kc = data.keychain;
    var key = atob(data.pubkey);
    var c = new EchoesCrypto();

    c.import_key(kc, key, 'spki').then(function() {
        return c.hash(key).then(function() {
            self.set_nickchain_property(nick, {
                public_key: c.keychain[kc].imported.public_key,
                hash: c.resulting_hash.match(/.{1,8}/g).join(' '),
                keychain: kc,
            });

            if (kc == 'keyx') {
                self.keyx_derive_key(nick, self.crypto.keychain[kc].private_key, self.get_nickchain_property(nick, 'public_key'));
            }

            self.ui.status('Imported ' + kc + ' public key from ' + nick + ' (' + self.get_nickchain_property(nick, 'hash') + ')');
            self.log(kc + ' pubkey import successful from: ' + nick + ' (' + self.get_nickchain_property(nick, 'hash') + ')', 0);
        }).catch(function(e) {
            self.wipe_nickchain(nick);
            self.update_encrypt_state(nick);

            self.ui.error({ error: 'Failed to import key from ' + nick, debug: kc + ': ' + e.toString() });
            self.log('hash: ' + e.toString(), 3);
        })
    }).catch(function(e) {
        self.wipe_nickchain(nick);
        self.update_encrypt_state(nick);

        self.ui.error({ error: 'Failed to import key from ' + nick, debug: kc + ': ' +  e.toString() });
        self.log('import key: ' + e.toString(), 3);
    });
}

/**
 * (async) Generate a new keypair before key exchange
 *
 * If 'endpoint' is not null/undefined, the exported pubkey will be sent
 * If kc is not specified 'encrypt' is used
 *
 * @param   {string} endpoint (optional) Who to send key to
 * @param   {string} kc       (default='encrypt') Which keychain to use
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_new_key = function(endpoint, kc) {
    kc = kc || 'encrypt';

    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    this.ui.status('Generting new ' + kc + ' session keys...');
    this.log('generating new ' + kc + ' session keypair...', 0);

    var self = this;
    this.crypto.generate_key(kc).then(function() {
        self.log(kc + ' keypair generated, exporting...', 0);
        return self.crypto.export_key(kc + '_public').then(function() {
            self.log(kc + ' public key exported successfully', 0);

            return self.crypto.hash(self.crypto.keychain[kc].exported.public_key).then(function() {
                self.crypto.keychain[kc].exported.hash = self.crypto.resulting_hash.match(/.{1,8}/g).join(' ');
                if (typeof endpoint != 'undefined'
                    && endpoint != null) {
                    self.log('sending ' + kc + ' public key to endpoint: ' + endpoint, 0);
                    self.keyx_send_key(endpoint);
                }
            }).catch(function(e) {
                self.ui.error('Failed to hash exported ' + kc + ' key: ' + e.toString());
            });
        }).catch(function(e) {
            self.ui.error('Failed to export key: ' + e.toString());
        });
    }).catch(function(e) {
        self.ui.error('Failed to generate keypair: ' + e.toString());
    });
}

/**
 * Send an exported public key to an endpoint
 *
 * If the client doesn't currently have a public key for the specified keychain, keyx_new_key is called first
 *
 * If browser supports elliptic curve, the 'keyx' keychain is used, else use 'encrypt'
 * If the endpoint already specified a supported keychain, use that instead
 *
 * !keyx is emitted to socket using { to: 'nick', pubkey: 'base64 encoded PEM formatted pubkey', keychain: 'keyx|encrypt' }
 *
 * @see EchoesClient#keyx_new_key
 * @see EchoesCrypto#browser_support
 *
 * @param   {string} endpoint Endpoint to send key to
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_send_key = function(endpoint) {
    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    var kc = this.get_nickchain_property(endpoint, 'keychain') || (this.crypto.browser_support.ec.supported ? 'keyx' : 'encrypt');

    if (typeof this.crypto == 'undefined'
        || this.crypto.keychain[kc].public_key == null) {
        this.keyx_new_key(endpoint, kc);
        return;
    }

    this.set_nickchain_property(endpoint, { keychain: kc });

    this.log('found existing ' + kc + ' keypair, broadcasting...', 0);
    this.socket.emit('!keyx', {
        to: endpoint,
        pubkey: btoa(this.crypto.keychain[kc].exported.public_key),
        keychain: kc,
    });
}

/**
 * Determines the encryption state for a window and sets the window state accordingly
 *
 * Changes the icon to the matching encryption state asset
 *
 * @see EchoesUi#set_window_state
 *
 * @param   {string} for_window Window name
 *
 * @returns {null}
 */
EchoesClient.prototype.update_encrypt_state = function(for_window) {
    var sent_decrypt_key = (this.get_nickchain_property(for_window, 'keysent') == true ? true : false);
    var received_encrypt_key = (this.get_nickchain_property(for_window, 'public_key') != null ? true : false);

    var state = 'unencrypted';
    if (received_encrypt_key && sent_decrypt_key) {
        state = 'encrypted';
    } else if (received_encrypt_key && ! sent_decrypt_key) {
        state = 'oneway';
    }

    this.ui.set_window_state(state, for_window);

    if (for_window == this.ui.active_window().attr('windowname')) {
        this.log('setting active window icon to ' + state, 0);
        for (var icon in this.ui.assets.encrypt) {
            this.ui.assets.encrypt[icon].hide();
        }
        this.ui.assets.encrypt[state].show();
    }

    this.log('window ' + for_window + ' set to ' + state + ' s:' + sent_decrypt_key + ' r:' + received_encrypt_key);
}

/**
 * Sets a this.nickchain property for a nick and initializes if chain is not defined yet
 *
 * Also updates the encryption state for windowname='nick'
 *
 * props = { public_key: '', symkey: '', keysent: true, ... }
 *
 * @see EchoesClient#pt_state
 *
 * @param   {string} nick     Nickname to set property on
 * @param   {object} props    Set of properties to apply to nickchain for nick
 *
 * @returns {null}
 */
EchoesClient.prototype.set_nickchain_property = function(nick, props) {
    if (typeof this.nickchain[nick] == 'undefined') {
        this.init_nickchain(nick);
    }

    for (var key in props) {
        this.nickchain[nick][key] = props[key];
    }

    this.update_encrypt_state(nick);
    this.log('set prop ' + JSON.stringify(props) + ' on nickchain: ' + nick, 0);
}

/**
 * Get a property value from a nick's this.nickchain
 *
 * Default prop = 'public_key'
 *
 * @param   {string} nick     Nickname to get property from
 * @param   {string} prop     (default='public_key') Property to retrieve
 *
 * @returns {null|string} Return property value or null
 */
EchoesClient.prototype.get_nickchain_property = function(nick, prop) {
    prop = prop || 'public_key';

    if (typeof this.nickchain[nick] == 'undefined') {
        this.init_nickchain(nick);
        return null;
    }

    if (typeof this.nickchain[nick][prop] == 'undefined') {
        return null;
    }

    this.log('get prop ' + prop + ' from keychain: ' + nick + ' (' + JSON.stringify(this.nickchain[nick][prop]) + ')', 0);
    return this.nickchain[nick][prop];
}

/**
 * Initialize nickchain for nickname
 *
 * @param   {string} nick Nickname
 *
 * @returns {null}
 */
EchoesClient.prototype.init_nickchain = function(nick) {
    this.nickchain[nick] = {};
    this.log('initialized nickchain for ' + nick, 0);
}

/**
 * Wipe without initializing nickchain for nickname
 *
 * @param   {string} nick Nickname
 *
 * @returns {null}
 */
EchoesClient.prototype.wipe_nickchain = function(nick) {
    delete this.nickchain[nick];
    this.log('wiped nickchain for ' + nick, 0);
}

/**
 * Wipe all keychains
 *
 * @returns {null}
 */
EchoesClient.prototype.wipe_all_nickchains = function() {
    this.nickchain = {};
    this.log('wiped all nickchains', 0);
}
