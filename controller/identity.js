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
function EchoesIdentity() {
    EchoesObject.call(this, 'id');

    /**
     * Cross reference to other objects must be set prioer to using methods
     */
    this.client = null;
    this.storage = null;

    /**
     * Identity object data to be manipulated by its methods
     */
    this.identity = null;
    this.device = null;
    this.email = null;
    this.session_id = null;
    this.nonce = null;
    this.nonce_signature = null;
    this.recovery_token = null;
    this.pubkey = null;
    this.privkey = null;
    this.imported = { privkey: null };
    this.exported = { privkey: null };
}
EchoesIdentity.prototype = Object.create(EchoesObject.prototype);
EchoesIdentity.prototype.constructor = EchoesIdentity;

/**
 * (async) Generates a new signing keypair and exports to
 *
 * self.pubkey - PEM formatted key
 * self.exported.privkey - PEM formatted private key
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesIdentity.prototype.generate_signing_keypair = function() {
    var self = this;

    return this.client.crypto.generate_key('sign', true).then(function() {
        return self.client.crypto.export_key('sign_public').then(function() {
            return self.client.crypto.export_key('sign_private').then(function() {
                self.log('signing keypair generated and exported', 0);
                self.pubkey = self.client.crypto.keychain.sign.exported.public_key;
                self.exported.privkey = self.client.crypto.keychain.sign.exported.private_key;
                self.imported.privkey = self.client.crypto.keychain.sign.private_key;
            }).catch(function(e) {
                self.log('failed to export signing privkey for new identity', 3);
            });
        }).catch(function(e) {
            self.log('failed to export signing pubkey for new identity', 3);
        });
    }).catch(function(e) {
        self.log('failed to generate signing keypair for new identity', 3);
    });
};

/**
 * (async) Send a registration request
 *
 * The data posted will be object properties: identity, pubkey, device, email
 * These must be set before calling register()
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesIdentity.prototype.register = function() {
    var self = this;

    var data = {
        identity: this.identity,
        pubkey: this.pubkey,
        device: this.device,
        recovery_token: this.recovery_token,
        email: this.email,
    };

    self.log('sending registration request with: ' + JSON.stringify(data), 0);
    return new Promise(function(resolve, reject) {
        $.ajax({
            type: "POST",
            url: AppConfig.PARALLAX_AUTH + '/register/',
            data: data,
            dataType: 'json',
        })
        .done(function (data) {
            switch (data.status) {
                case 'success':
                    self.log('registration reply incoming: ' + JSON.stringify(data), 0);
                    self.log('successfully registered identity: ' + self.identity, 1);
                    resolve();
                break;
                default:
                    self.log('registration error: ' + JSON.stringify(data), 3);
                    reject(data.message + ': ' + data.log);
                break;
            }
        })
        .fail(function (err) {
            self.log('reg request http fail: ' + JSON.stringify(err), 3);
            reject('Registration request transport failure');
        });
    });
};

/**
 * (async) Load identity from storage and import the PEM private key
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesIdentity.prototype.load_identity = function() {
    var self = this;

    return new Promise(function(resolve, reject) {
        self.storage.get('identity', function(data) {
            if (typeof data.identity == 'undefined'
                || data.identity === null) {
                self.log("no identity found in storage", 3);
                reject('No identity found in storage');
            } else {
                var identity_data = JSON.parse(data.identity);
                self.client.crypto.import_key('sign', identity_data.privkey, 'pkcs8', true)
                    .then(function() {
                        self.identity = identity_data.identity;
                        self.device = identity_data.device;
                        self.pubkey = identity_data.pubkey;
                        self.privkey = identity_data.privkey;
                        self.email = identity_data.email;
                        self.imported.privkey = self.client.crypto.keychain.sign.imported.private_key;
                        self.log("identity '" + self.identity + "' loaded from storage", 1);
                        resolve();
                    })
                    .catch(function(e) {
                        self.identity = null;
                        self.log("failed to load identity '" + identity_data.identity + "' from storage: " + e, 3);
                        reject(e);
                    });
            }
        });
    });
};

/**
 * (async) Save identity object to storage
 *
 * Uses this.exported.privkey, if no privkey was loaded from storage
 *
 * Data format: {'identity': JSON.stringify(identity_data) }
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesIdentity.prototype.save_identity = function() {
    var self = this;

    this.privkey = this.exported.privkey || this.privkey; // this should be wrapped with aes

    var identity_data = {
        identity: this.identity,
        pubkey: this.pubkey,
        privkey: this.privkey,
        device: this.device,
        email: this.email,
    };

    return new Promise(function(resolve, reject) {
        self.storage.set('identity', JSON.stringify(identity_data), function() {
            self.log("identity '" + self.identity + "' saved to storage", 1);
            resolve();
        });
    });
};

/**
 * (async) Initiate an authentication request
 *
 * Identity must be loaded first, this.device and this.identity must be set
 *
 * If request is successful, the nonce is signed and stored in:
 *
 * self.nonce
 * self.nonce_signature
 *
 * to be later sent with this.auth_reply
 *
 * @see EchoesIdentity#load_identity
 * @see EchoesIdentity#nonce
 * @see EchoesIdentity#nonce_signature
 * @see EchoesIdentity#auth_reply
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesIdentity.prototype.auth_request = function() {
    var self = this;

    var data = {
        identity: this.identity,
        device: this.device,
    };

    return new Promise(function(resolve, reject) {
        $.ajax({
            type: "POST",
            url: AppConfig.PARALLAX_AUTH + '/auth-request/',
            data: data,
            dataType: 'json',
        })
        .done(function (data) {
            switch (data.status) {
                case 'success':
                    self.nonce = data.nonce;

                    self.log('auth request incoming: ' + JSON.stringify(data), 0);
                    return self.client.crypto.sign(self.nonce, self.imported.privkey)
                        .then(function() {
                            var nonce_signature = btoa(self.client.crypto.resulting_signature);
                            self.nonce_signature = nonce_signature;
                            self.log('signature for: ' + self.nonce + ' stored in self.id.nonce_signature', 1);
                            resolve();
                        })
                        .catch(function(e) {
                            self.log('failed to sign nonce from auth-reply: ' + data.nonce + ', e: ' + e, 3);
                            reject(e);
                        });
                default:
                break;
            }
            self.log('auth request error: ' + data.message, 3);
            reject(data.message + ': ' + (data.log || data.db_log));
            return false;
        })
        .fail(function (err) {
            self.log('auth request http fail: ' + JSON.stringify(err), 3);
            reject('Auth request transport failure');
        });
    });
};

/**
 * (async) Reply to auth request with signed nonce
 *
 * If successful, the server provided session_id will stored in self.session_id
 *
 * @see EchoesIdentity#auth_request
 * @see EchoesIdentity#nonce
 * @see EchoesIdentity#nonce_signature
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesIdentity.prototype.auth_reply = function() {
    var self = this;

    var data = {
        nonce_identity: this.identity,
        nonce: this.nonce,
        nonce_signature: this.nonce_signature,
        device: this.device,
    };

    return new Promise(function(resolve, reject) {
        $.ajax({
            type: "POST",
            url: AppConfig.PARALLAX_AUTH + '/auth-reply/',
            data: data,
            dataType: 'json',
        })
        .done(function (data) {
            switch (data.status) {
                case 'success':
                    self.session_id = data.session_id;
                    self.log('auth successful for ' + self.identity + ', session id stored in self.session_id', 0);
                    resolve();
                    return true;
                default:
                break;
            }

            self.log('auth reply error: ' + JSON.stringify(data), 3);
            reject(data.message + ': ' + data.log);
            return false;
        })
        .fail(function (err) {
            self.log('auth reply http fail: ' + JSON.stringify(err), 3);
            reject('Auth reply transport failure');
        });
    });
};

/**
 * (async) Request a new recovery token
 *
 * Identity must be loaded first, this.device and this.identity must be set
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesIdentity.prototype.recovery_token_request = function() {
    var self = this;

    var data = {
        identity: this.identity,
        device: this.device,
        email: this.email,
    };

    return new Promise(function(resolve, reject) {
        $.ajax({
            type: "POST",
            url: AppConfig.PARALLAX_AUTH + '/recovery-token/',
            data: data,
            dataType: 'json',
        })
        .done(function (data) {
            switch (data.status) {
                case 'success':
                    self.log('recovery token reply: ' + JSON.stringify(data), 0);
                    self.log('recovery token requested for ' + self.identity + '@' + self.device, 1);
                    resolve();
                    return true;
                default:
                break;
            }
            self.log('recovery token request error: ' + data.message, 3);
            reject(data.message + ': ' + (data.log || data.db_log));
            return false;
        })
        .fail(function (err) {
            self.log('recovery token request http fail: ' + JSON.stringify(err), 3);
            reject('Recovery token request transport failure');
        });
    });
};
