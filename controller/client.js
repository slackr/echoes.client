/* global AppConfig */
/* global $ */
/* global EchoesObject */
/* global EchoesCrypto */
/* global Promise */
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
    EchoesObject.call(this, 'client');

    this.socket = null; // socket.io object ref
    this.ui = null; // ui object ref
    this.crypto = null; // crypto object ref
    this.id = null; // crypto object ref

    /**
     * @type Object A hash of nicknames and their imported keys/symkeys and keysent status
     */
    this.nickchain = {};

    this.commands = {
        offline: {
            '/clear_storage': 'Delete identity data from storage',
            '/connect': 'Initiate a new connection to the server. Identity will be re-authenticated',
            '/disconnect': 'Disconnect from the server',
            '/exit': 'Disconnect from the server and exit the app',
            '/clear': 'Clear the current window text',
            '/config': 'Modify the value of a config variable for the session: /config [key] [val]',
            '/window': 'Switch to a new window: /window [windowname]',
            '/help': 'Show a list of available commands',
        },
        online: {
            '/echo': 'Send regular echo to nick/#chan: /echo [target] [text]',
            '/eecho': 'Send encrypted echo to nickname: /eecho [nick] [text]',
            '/pm': 'Initiate a private message session with nick: /pm [nick]',
            '/keyx': 'Initiate key exchange for end-to-end encryption with nick: /keyx [nick]',
            '/keyx_off': 'Disable end-to-end encryption with nick (will also notify nick): /keyx_off [nick]',
            '/join': 'Join a channel: /join [#chan]',
            '/part': 'Part a channel: /part [#chan]',
            '/list': 'Retrieve a list active channels from the server',
            '/ulist': 'Retrieve a list of channels you have joined from the server',
            '/who': 'Show a list of users currently joined to a channel: /who [#chan]',
        }
    };
}
EchoesClient.prototype = Object.create(EchoesObject.prototype);
EchoesClient.prototype.constructor = EchoesClient;

/**
 * Process and execute a client command
 *
 * First array element will be the command, the rest are the commands parameters
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
    var self = this;
    var command = params[0];
    params.shift();

    if (typeof this.commands.offline[command] == 'undefined' && ! this.is_connected()) {
        this.ui.error('Not connected to a server. /connect first!');
        return;
    }

    switch (command) {
        case '/help':
            this.show_help();
        break;
        case '/quit':
        case '/exit':
            self.ui.popup('Exit', 'Are you sure you exit the app?', 'EXIT', 'CANCEL', function() {
                if (self.socket.sio !== null) {
                    self.socket.sio.disconnect();
                }
                self.ui.popup_close();
                window.close();
            });
        break;
        case '/clear_storage':
        case '/storage_clear':
            this.ui.popup('Storage', 'Are you sure you want to clear the app storage? Identity will be lost and you will be disconnected...', 'CANCEL', 'CLEAR STORAGE', null, function() {
                self.id.storage.clear();
                if (self.is_connected()) {
                    self.socket.sio.disconnect();
                }

                self.ui.popup('Storage', 'The storage was cleared.', 'NEW IDENTITY', 'RECOVER',
                    function() {
                        self.register_show();
                    },
                    function() {
                        self.recovery_show();
                    });
            });
        break;
        case '/reconnect':
        case '/connect':
            if (self.is_connected()) {
                self.ui.popup('Connect', 'You are already connected! Reconnect?', 'RECONNECT', 'CANCEL', function() {
                    self.socket.sio.disconnect();
                    self.ui.popup_close();
                    self.connect();
                });
            } else {
                self.connect();
            }
        break;
        case '/disconnect':
            if (self.is_connected()) {
                self.ui.popup('Disconnect', 'Are you sure you want to disconnect?', 'DISCONNECT', 'CANCEL', function() {
                    self.socket.sio.disconnect();
                    self.ui.popup_close();
                    self.ui.error('You have been disconnected. To reconnect, reload the app or type /connect');
                });
            } else {
                self.ui.error('You are not connected. /connect first!');
            }
        break;
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
                default:
                    this.ui.error('Invalid AppConfig variable');
                    this.log('Invalid AppConfig variable ' + params[0], 3);
                break;
            }
        break;
        case '/clear':
            this.ui.active_window().html('');
        break;
        case '/pm':
        case '/msg':
        case '/private':
        case '/query':
            var query_nick = params[0];

            this.ui.progress(10);
            this.socket.sio.emit('/pm', query_nick);
        break;
        case '/w':
        case '/win':
        case '/window':
            var win = params[0];
            if (win) {
                this.ui.click_window(win);
            } else {
                this.ui.status('Current window: ' + this.ui.active_window().attr('windowname'));
            }
        break;
        case '/echo':
            var echo_to = params[0];
            var echo = params[1];

            this.ui.echo({
                nick: this.id.identity,
                type: 'out',
                echo: echo,
                window: echo_to,
            });

            this.socket.sio.emit('/echo', { echo: echo, to: echo_to });
        break;
        case '/eecho':
            var eecho_to = params[0];
            var plaintext = params[1];

            this.send_encrypted_echo(eecho_to, plaintext);
        break;
        case '/encryption_on':
        case '/key_exchange':
        case '/keyx':
            this.keyx_send_key(params[0]);
        break;
        case '/encryption_off':
        case '/keyx_off':
            this.keyx_off(params[0], true);
        break;

        default:
            if (params.length === 0) {
                params[0] = this.ui.active_window().attr('windowname');
            }

            this.socket.sio.emit(command, params);
            this.log('passed unhandled command to server: ' + command + ' ' + params.join(' '), 0);
        break;
    }
};

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

    if (echo === '') {
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
};

/**
 * Looks for channel windows and autojoins
 *
 * @returns {null}
 */
EchoesClient.prototype.auto_join_channels = function() {
    var self = this;

    this.log('Auto-joining previously joined channels...', 0);
    this.ui.joined_channels().each(function() {
        self.execute_command(['/join', $(this).attr('windowname')]);
    });
};

/**
 * (async) Derive a symmetric key using two CryptoKey objects
 *
 * If either public/private key parameters are null, derivation is aborted
 *
 * @param   {string} nick           Which nick's keystore to use
 * @param   {CryptoKey} private_key Object representing a private key
 * @param   {CryptoKey} public_key  Object representing a public key
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesClient.prototype.keyx_derive_key = function(nick, private_key, public_key) {
    if (! private_key || ! public_key) {
        this.ui.log('keyx symkey derivation failed, pub: ' + public_key + ', priv: ' + private_key, 3);
        return Promise.reject('Invalid public or private key');
    }
    var self = this;
    var c = new EchoesCrypto();

    return c.derive_key(private_key, public_key).then(function() {
        self.set_nickchain_property(nick, {
            symkey: c.derived_key,
        });

        self.update_encrypt_state(nick);

        self.ui.status('Successfully derived encryption key for ' + nick);
        self.log('symkey derived for: ' + nick, 0);
    }).catch(function(e){
        self.wipe_nickchain(nick);
        self.update_encrypt_state(nick);

        self.ui.error({ error: 'Failed to derive encryption key for ' + nick, debug: e.toString() });
        self.log('derive: ' + e.toString(), 3);
    });
};

/**
 * (async) Decrypts encrypted symkey from nick using private key
 *
 * @param   {string} nick                           Nickchain to use
 * @param   {Array} encrypted_symkey_segments       Array of encrypted segments to pass to decrypt_asym
 * @param   {CryptoKey} private_key                 CrytpoKey object to use for decryption
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesClient.prototype.keyx_decrypt_symkey = function(nick, encrypted_symkey_segments, private_key) {
    if (! private_key) {
        this.ui.log('decrypt symkey failed, priv: ' + private_key, 3);
        return Promise.rejected('Invalid private key');
    }
    var self = this;
    var c = new EchoesCrypto();
    var kc = 'sym';

    return c.decrypt_asym(encrypted_symkey_segments, private_key).then(function() {
        self.log('symkey decrypt successful from: ' + nick, 0);

        return c.import_key(kc, c.decrypted_text, 'raw', false).then(function() {
            self.set_nickchain_property(nick, {
                symkey: c.keychain[kc].imported.key
            });

            self.ui.status('Successfully retrieved symkey from ' + nick);
            self.log('symkey decrypted from: ' + nick + ' (' + self.get_nickchain_property(nick, 'symkey') + ')', 0);
        }).catch(function(e) {
            self.ui.error({ error: 'Failed to import symkey from ' + nick, debug: kc + ': ' + e.toString() });
            self.log('decrypt symkey: ' + e.toString(), 3);
        });
    }).catch(function(e) {
        self.ui.error({ error: 'Failed to decrypt symkey from ' + nick, debug: kc + ': ' + e.toString() });
        self.log('decrypt symkey: ' + e.toString(), 3);
    });
};

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
    if (kc === null || this.get_nickchain_property(nick, 'symkey') === null) {
        this.ui.error("Unable to decrypt echo from " + nick + ". No decryption key available. Initiate a key exchange.");
        return;
    }
    if (typeof echo != 'object' || echo.length === 0) {
        this.ui.log('invalid encrypted echo from ' + nick + ': ' + typeof echo, 3);
        this.ui.error("Could not decrypt echo from " + nick + ". It appears invalid.");
        return;
    }

    var self = this;
    var c = new EchoesCrypto();

    this.ui.progress(50);
    c.decrypt(echo, this.crypto.keychain[kc].private_key, this.get_nickchain_property(nick, 'symkey')).then(function() {
        self.ui.progress(101);
        self.ui.echo({
            type: 'in',
            avatar: '',
            encrypted: true,
            echo: c.decrypted_text,
            window: nick,
            nick: nick,
            broadcast: false
        });
    }).catch(function(e) {
        self.ui.progress(101);
        self.ui.error({
            error: 'Could not decrypt echo from ' + nick,
            debug: kc + ': ' + e.toString()
        });
    });
};

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

    if (this.get_nickchain_property(nick, 'symkey') ===  null) {
        this.ui.error("You do not have an encryption key for " + nick + ". Initiate a key exchange first.");
        this.log('no encryption key found in nickchain: ' + nick, 3);
        return;
    }

    var self = this;
    var c = new EchoesCrypto();

    this.ui.progress(30);
    c.encrypt(echo, this.get_nickchain_property(nick, 'public_key'), this.get_nickchain_property(nick, 'symkey')).then(function() {
        self.ui.progress(80);

        var and_echoes = false;

        self.socket.sio.emit('/echo', { // bypass execute_command for encrypted echoes, we'll write it on the wall manually below
            type: 'encrypted',
            to: nick,
            echo: c.encrypted_segments, // an array of base64 encoded segments
        });

        if (self.ui.get_window(nick).length === 0) {
            and_echoes = true;
        }

        self.ui.echo({
            type: 'out',
            encrypted: true,
            avatar: '',
            echo: echo,
            window: nick,
            nick: self.id.identity,
            broadcast: and_echoes,
        });
    }).catch(function(e) {
        self.ui.progress(101);
        self.ui.error({
            error: 'Encrypt operation failed on echo to ' + nick,
            debug: e.toString()
        });
    });
};

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

    this.ui.error('Warning: Encryption has been turned off for: ' + endpoint, endpoint, true);

    if (inform_endpoint) {
        this.socket.sio.emit('!keyx_off', {
            to: endpoint
        });
    }
};

/**
 * (async) Import keyx data from server
 *
 * Marked as async because key derivation for keyx is asynchronous (i should fix this)
 * Right now this function assumes it's public and will use 'spki' as the type
 *
 * data = { from: 'nick', keychain: 'keyx|asym', pubkey: 'base64 encoded PEM pubkey' }
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

    this.ui.progress(10);

    var self = this;
    var nick = data.from;
    var kc = data.keychain;
    var encrypted_symkey_segments = data.symkey;
    var key = atob(data.pubkey);
    var c = new EchoesCrypto();

    c.import_key(kc, key, 'spki').then(function() {
        self.ui.progress(30);
        return c.hash(key).then(function() {
            self.ui.progress(50);
            var nick_pubkey = c.keychain[kc].imported.public_key;

            self.set_nickchain_property(nick, {
                public_key: nick_pubkey,
                hash: c.resulting_hash.match(/.{1,8}/g).join(' '),
                keychain: kc,
            });

            self.ui.status('Imported public key from ' + nick + ' (' + self.get_nickchain_property(nick, 'hash') + ')', nick, true);
            self.log(kc + ' pubkey import successful from: ' + nick + ' (' + self.get_nickchain_property(nick, 'hash') + ')', 0);

            if (kc == 'keyx') {
                if (self.crypto.keychain[kc].private_key) {
                    return self.keyx_derive_key(nick, self.crypto.keychain[kc].private_key, nick_pubkey).then(function(){
                        self.ui.progress(101);
                        self.log('key derivation successful after import', 0);
                    }).catch(function(e){
                        self.ui.progress(101);
                        self.log('key derivation failed after import: ' + e.toString(), 3);
                    });
                } else {
                    self.ui.progress(101);
                    self.log('key derivation skipped, no private key in keychain: ' + kc, 0);
                    return Promise.resolve();
                }
            }

            // if a symkey is sent with pubkey, attempt to decrypt it, otherwise generate a new symkey to be sent back
            if (encrypted_symkey_segments) {
                return self.keyx_decrypt_symkey(nick, encrypted_symkey_segments, self.crypto.keychain[kc].private_key).then(function(){
                    self.ui.progress(101);
                    self.log('symkey decryption successful after import', 0);
                }).catch(function(e){
                    self.ui.progress(101);
                    self.log('symkey decryption failed after import: ' + e.toString(), 3);
                });
            } else {
                self.log(kc + ' no symkey supplied by: ' + nick + ', generating a new one...', 0);
                return c.generate_key('sym', true).then(function(){
                    self.ui.progress(70);
                    self.set_nickchain_property(nick, { symkey: c.keychain['sym'].key });
                    return c.export_key('sym').then(function(){
                        self.ui.progress(80);
                        return c.encrypt_asym(c.keychain['sym'].exported.key, nick_pubkey).then(function(){
                            self.ui.progress(101);
                            self.set_nickchain_property(nick, { encrypted_symkey: c.encrypted_segments });
                            self.ui.status('Sucessfully generated symkey for ' + nick, nick, true);
                        }).catch(function(e){
                            self.ui.progress(101);
                            self.ui.error({ error: 'Failed to encrypt symkey for ' + nick, debug: e.toString() }, nick, true);
                            self.log('encrypt_asym for symkey to ' + nick + ' failed: ' + e.toString(), 3);
                        });
                    }).catch(function(e){
                        self.ui.progress(101);
                        self.ui.error({ error: 'Failed to export symkey for ' + nick, debug: e.toString() }, nick, true);
                        self.log('export_key for symkey to ' + nick + ' failed:', 3);
                    });
                }).catch(function(e){
                    self.ui.progress(101);
                    self.ui.error({ error: 'Failed to generate symkey for ' + nick, debug: e.toString() }, nick, true);
                    self.log('generate_key for symkey to ' + nick + ' failed: ' + e.toString(), 3);
                });
            }
        }).catch(function(e) {
            self.ui.progress(101);
            self.wipe_nickchain(nick);
            self.update_encrypt_state(nick);

            self.ui.error({ error: 'Failed hash public key from ' + nick, debug: kc + ': ' + e.toString() }, nick, true);
            self.log('hash: ' + e.toString(), 3);
        });
    }).catch(function(e) {
        self.ui.progress(101);
        self.wipe_nickchain(nick);
        self.update_encrypt_state(nick);

        self.ui.error({ error: 'Failed to import public key from ' + nick, debug: kc + ': ' +  e.toString() }, nick, true);
        self.log('import key: ' + e.toString(), 3);
    });
};

/**
 * (async) Generate a new keypair before key exchange
 *
 * If 'endpoint' is not null/undefined, the exported pubkey will be sent
 * If kc is not specified 'asym' is used
 *
 * @param   {string} endpoint (optional) Who to send key to
 * @param   {string} kc       (default='asym') Which keychain to use
 *
 * @returns {null}
 */
EchoesClient.prototype.keyx_new_key = function(endpoint, kc) {
    this.ui.progress(10);

    kc = kc || 'asym';

    if (! this.crypto.browser_support.crypto.supported) {
        this.ui.progress(101);
        this.ui.error('Your browser does not support encrypted echoes, try the latest Chrome/Firefox');
        this.log('browser not marked as supported for crypto: ' + navigator.userAgent, 0);
        return;
    }

    this.ui.progress(20);
    this.ui.status('Generating new session keys (' + kc + ')...', null, true);
    this.log('generating new ' + kc + ' session keypair...', 0);

    var self = this;
    this.crypto.generate_key(kc).then(function() {
        self.ui.progress(40);
        self.log(kc + ' keypair generated, exporting...', 0);
        return self.crypto.export_key(kc + '_public').then(function() {
            self.ui.progress(80);
            self.log(kc + ' public key exported successfully', 0);

            return self.crypto.hash(self.crypto.keychain[kc].exported.public_key).then(function() {
                self.ui.progress(101);
                self.crypto.keychain[kc].exported.hash = self.crypto.resulting_hash.match(/.{1,8}/g).join(' ');
                self.ui.status('Successfully generated new session key (' + kc + '): ' + self.crypto.keychain[kc].exported.hash, null, true);
                
                if (typeof endpoint != 'undefined' && endpoint !== null) {
                    self.log('sending ' + kc + ' public key to endpoint: ' + endpoint, 0);
                    self.keyx_send_key(endpoint);
                }

            }).catch(function(e) {
                self.ui.progress(101);
                self.ui.error({ error: 'Failed to hash exported ' + kc + ' key', debug: e.toString() });
            });
        }).catch(function(e) {
            self.ui.progress(101);
            self.ui.error({ error: 'Failed to export ' + kc + ' key', debug: e.toString() });
        });
    }).catch(function(e) {
        self.ui.progress(101);
        self.ui.error({ error: 'Failed to generate ' + kc + ' keypair', debug: e.toString() });
    });
};

/**
 * Send an exported public key to an endpoint
 *
 * If the client doesn't currently have a public key for the specified keychain, keyx_new_key is called first
 *
 * If browser supports elliptic curve, the 'keyx' keychain is used, else use 'asym'
 * If the endpoint already specified a supported keychain, use that instead
 *
 * !keyx is emitted to socket using { to: 'nick', pubkey: 'base64 encoded PEM formatted pubkey', keychain: 'keyx|asym' }
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

    var kc = this.get_nickchain_property(endpoint, 'keychain') || (this.crypto.browser_support.ec.supported ? 'keyx' : 'asym');

    this.ui.progress(10);
    if (this.crypto.keychain[kc].public_key === null) {
        this.keyx_new_key(endpoint, kc);
        return;
    }

    this.set_nickchain_property(endpoint, { keychain: kc });

    this.log('found existing ' + kc + ' keypair, broadcasting...', 0);

    var broadcast = {
        to: endpoint,
        pubkey: btoa(this.crypto.keychain[kc].exported.public_key),
        keychain: kc,
        symkey: this.get_nickchain_property(endpoint, 'encrypted_symkey'), // generated after import of pubkey in keyx_import()
    };

    this.ui.progress(50);
    this.socket.sio.emit('!keyx', broadcast);
};

/**
 * Determines the encryption state for a window and sets the window state accordingly
 *
 * @see EchoesUi#set_window_state
 *
 * @param   {string} for_window Window name
 *
 * @returns {null}
 */
EchoesClient.prototype.update_encrypt_state = function(for_window) {
    if (this.ui.get_window(for_window).attr('windowtype') != 'nickname') {
        this.log('window encrypt state update skipped for non-nickname window: ' + for_window, 0);
        return;
    }

    var sent_decrypt_key = (this.get_nickchain_property(for_window, 'keysent') === true ? true : false);
    var received_encrypt_key = (this.get_nickchain_property(for_window, 'public_key') !== null ? true : false);

    var state = 'unencrypted';
    if (received_encrypt_key && sent_decrypt_key) {
        state = 'encrypted';
    } else if (received_encrypt_key && ! sent_decrypt_key) {
        state = 'oneway';
    }

    this.ui.set_window_state(state, for_window);

    this.log('window ' + for_window + ' set to ' + state + ' sent?:' + sent_decrypt_key + ' recv?:' + received_encrypt_key, 0);
};

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
};

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
};

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
};

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
};

/**
 * Wipe all keychains
 *
 * @returns {null}
 */
EchoesClient.prototype.wipe_all_nickchains = function() {
    this.nickchain = {};
    this.log('wiped all nickchains', 0);
};

/**
 * Display the registration window
 *
 * @returns {null}
 */
EchoesClient.prototype.register_show = function(initial_message) {
    var self = this;
    this.ui.ui.popup.message.html('');

    var fields = {
        'Nickname': {
            input_id: 'register_input_nickname',
            focus: true,
            id_value: 'identity',
        },
        'Your@email.com': {
            input_id: 'register_input_email',
            id_value: 'email',
        },
        'Your@email.com again': {
            input_id: 'register_input_email_confirm',
        },
        'Recovery Token (if available)': {
            input_id: 'register_input_recovery_token'
        },
    };

    this.ui.ui.popup.message.append(
        $('<div>')
            .addClass('registration_message')
            .attr('id', 'registration_message')
            .text(initial_message)
    );
    var registration_message = $('#registration_message');

    for (var field in fields) {
        this.ui.ui.popup.message.append(
            $('<input>')
                .addClass('register_field_input')
                .attr('id', fields[field].input_id)
                .attr('placeholder', field)
        );
        if (fields[field].focus) {
            $('#' + fields[field].input_id).focus();
        }
        if (fields[field].id_value) {
            $('#' + fields[field].input_id).val(this.id[fields[field].id_value]);
        }
    }

    this.ui.popup('New Identity', '', 'CREATE', 'RECOVER',
        function() {
            self.ui.progress(10);
            self.register_submit().catch(function(e) {
                self.ui.progress(101);
                registration_message.text(e);
            });
        },
        function() {
            var recovery_token = $('#' + fields['Recovery Token (if available)'].input_id).val();
            if (recovery_token.length > 0) {
                self.ui.progress(10);
                self.register_submit().catch(function(e) {
                    self.ui.progress(101);
                    registration_message.text(e);
                });
            } else {
                self.recovery_show();
            }
        }
    );

    //this.ui.ui.popup.message.find('input:first').focus();
};

/**
 * (async) Submit the registration request
 *
 * @param   {EchoesClient} self Self object reference
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesClient.prototype.register_submit = function() {
    this.ui.progress(20);

    var self = this;
    var register_data = {
        identity: self.ui.ui.popup.message.find('#register_input_nickname').val(),
        email: self.ui.ui.popup.message.find('#register_input_email').val(),
        email_confirm: self.ui.ui.popup.message.find('#register_input_email_confirm').val(),
        recovery_token: self.ui.ui.popup.message.find('#register_input_recovery_token').val(),
        device: self.id.device,
    };

    if (! register_data.identity) {
        self.ui.ui.popup.message.find('#register_input_nickname').focus();
        return Promise.reject('Please enter a valid nickname');
    }
    if (! register_data.email) {
        self.ui.ui.popup.message.find('#register_input_email').focus();
        return Promise.reject('Please enter a valid email address');
    }
    if (register_data.email !== register_data.email_confirm) {
        self.ui.ui.popup.message.find('#register_input_email_confirm').focus();
        return Promise.reject('The two email addresses do not match');
    }

    var registration_message = $('#registration_message');

    self.ui.progress(30);
    self.log('starting registration for ' + JSON.stringify(register_data), 0);
    return self.id.generate_signing_keypair().then(function(){
        self.ui.progress(50);

        self.id.identity = register_data.identity;
        self.id.device = register_data.device;
        self.id.email = register_data.email;
        self.id.recovery_token = register_data.recovery_token;
        self.id.register().then(function(){
            self.ui.progress(70);

            self.log('registration successful for ' + JSON.stringify(register_data), 0);
            registration_message.text('Successfully registered nickname: ' + self.id.identity);
            self.ui.popup_center();
            self.id.save_identity().then(function(){
                self.ui.progress(101);
                self.connect();
            }).catch(function(e){
                self.ui.progress(101);
                registration_message.text(e);
                self.ui.popup_center();
            });
        }).catch(function(e){
            self.ui.progress(101);
            registration_message.text(e);
            self.ui.popup_center();
            self.log(e, 3);
        });
    }).catch(function(e){
        self.ui.progress(101);
        self.log('failed to generate signing keypair for ' + JSON.stringify(register_data), 3);
        registration_message.text(e);
        self.ui.popup_center();
    });
};

/**
 * Display the identity recovery window
 *
 * @returns {null}
 */
EchoesClient.prototype.recovery_show = function() {
    var self = this;
    this.ui.ui.popup.message.html('');

    var fields = {
        'Nickname': {
            input_id: 'register_input_nickname',
            focus: true,
        },
        "Email@address.com used during registration": {
            input_id: 'register_input_email'
        },
    };

    this.ui.ui.popup.message.append(
        $('<div>')
            .addClass('registration_message')
            .attr('id', 'registration_message')
            .text('')
    );

    var registration_message = $('#registration_message');

    for (var field in fields) {
        this.ui.ui.popup.message.append(
            $('<input>')
                .addClass('register_field_input')
                .attr('id', fields[field].input_id)
                .attr('placeholder', field)
        );
        if (fields[field].focus) {
            $('#' + fields[field].input_id).focus();
        }
    }
    this.ui.popup('Recover Identity', '', 'REQUEST TOKEN', 'CANCEL',
        function() {
            self.id.identity = self.ui.ui.popup.message.find('#register_input_nickname').val();
            self.id.email = self.ui.ui.popup.message.find('#register_input_email').val();

            if (! self.id.identity) {
                self.ui.ui.popup.message.find('#register_input_nickname').focus();
                registration_message.text('Please enter a valid nickname');
                return;
            }
            if (! self.id.email) {
                self.ui.ui.popup.message.find('#register_input_email').focus();
                registration_message.text('Please enter a valid email address');
                return;
            }

            self.ui.progress(10);
            self.id.recovery_token_request().then(function(){
                self.ui.progress(101);
                self.register_show('A recovery token has been emailed to you. Please enter it below to recover an existing identity.');
            }).catch(function(e){
                self.ui.progress(101);
                registration_message.text(e);
                self.ui.popup_center();
                self.log(e, 3);
            });
        },
        function() {
            self.register_show();
        }
    );

    //this.ui.ui.popup.message.find('input:first').focus();
};

/**
 * Initiate the authentication request
 *
 * If successful display popup with connect(), else register_show()
 *
 * @returns {null}
 */
EchoesClient.prototype.connect = function() {
    this.ui.progress(50);
    var self = this;
    this.id.auth_request().then(function(){
        self.ui.progress(80);
        self.id.auth_reply().then(function(){
            self.ui.progress(101);
            self.ui.popup('Ready','Hello ' + self.id.identity + '!', 'CONNECT', null, function() {
                self.ui.status('Connecting...');

                self.socket.initialize();
                self.ui.popup_close();
            });
        }).catch(function(e){
            self.ui.progress(101);
            self.ui.popup('Error','Failed to authenticate nickname: ' + self.id.identity + ' (' + e + ')', 'RETRY', 'NEW NICKNAME', function() {
                self.connect();
                self.ui.popup_close();
            }, function() {
                self.register_show();
            });
        });
    }).catch(function(e){
        self.ui.progress(101);
        self.ui.popup('Error','Failed to authenticate nickname: ' + self.id.identity + ' (' + e + ')', 'RETRY', 'NEW NICKNAME', function() {
            self.connect();
            self.ui.popup_close();
        }, function() {
            self.register_show();
        });
    });
};

/**
 * Determine if client is connected to server
 *
 * @returns {bool} Is the client connected?
 */
EchoesClient.prototype.is_connected = function() {
    if (typeof this.socket == 'undefined' || 
        typeof this.socket.sio == 'undefined' || 
        ! this.socket.sio || 
        ! this.socket.sio.connected) {
        return false;
    }
    return true;
};

/**
 * Display available commands
 */
EchoesClient.prototype.show_help = function() {
    for (var cmd_type in this.commands) {
        this.ui.echo({
            type: 'error',
            echo: 'Available ' + cmd_type + ' commands:',
            broadcast: false,
            notify: false,
            info: ' ',
        });
        for (var cmd in this.commands[cmd_type]) {
            this.ui.echo({
                type: 'status',
                echo: cmd + ' - ' + this.commands[cmd_type][cmd],
                broadcast: false,
                notify: false,
                info: ' ',
            });
        }
    }
};
