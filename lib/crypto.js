/* global unescape */
/* global escape */
/* global crypto */
/**
 * Echoes Client
 *
 * @author  Adrian@Slacknet
 * @license http://www.gnu.org/licenses/gpl-3.0.txt GPLv3
 */

/**
 * from https://chromium.googlesource.com/chromium/blink/+/master/LayoutTests/crypto/subtle
 * and http://kjur.github.io/jsjws/tool_b64udec.html
 */

/**
 * Handles cryptography operations using WebCrypto implementations known to Echoes
 *
 * @class
 * @extends EchoesObject
 */
function EchoesCrypto() {
    EchoesObject.call(this, 'crypto');

    /**
     * various algorithms used by EC
     */
    this.algo = {
        asym: {
            name: 'RSA-OAEP',
            hash: { name: 'sha-256' },
            modulusLength: 2048,
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]),  // Equivalent to 65537
        },
        keyx: { // diffiehellman key exchange
            name: "ECDH",
            namedCurve: "P-256"
        },
        hkdf: { // not yet implemented
            name: "HKDF",
            hash: "SHA-256",
        },
        sign: {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: 'SHA-256' },
            modulusLength: 2048,
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]),  // Equivalent to 65537
        },
        sym: {
            name: 'AES-GCM',
            length: 128,
            tagLength: 128,
        },
        digest: {
            name: "SHA-1",
        },
        derive: {
            name: 'AES-GCM',
            length: 128,
            tagLength: 128,
        }
    };

    /**
     * browser support for webcrypto or elliptic curve
     * if a browser is not found to match a known name and version for each
     * feature, 'supported' will be set to false
     */
    this.browser_support = {
        crypto: {
            known: {
                'Chrome': 37,
                'Firefox': 35,
            },
            supported: false,
        },
        ec: {
            known: {
                'Chrome': 42,
                // firefox support for export/import of ec sign/keyx keys is buggy
                /*'Firefox': 35,*/
            },
            supported: false,
        }
    };

    /**
     * during [ec/rsa] encryption/decryption operation data is split into chunks
     * and added to these arrays for further proccessing
     */
    this.encrypted_segments = [];
    this.decrypted_segments = [];

    /**
     * the final result of processing this.decrypted_segments is stored here
     * this shoul be human-readable text
     */
    this.decrypted_text = null;

    /**
     * hash method stores hex result here
     */
    this.resulting_hash = null;

    /**
     * sign method stores binary string here
     */
    this.resulting_signature = null;

    /**
     * when using a key exchange (ECDH) method,
     * the derived symkey (CryptoKey) object is stored here
     */
    this.derived_key = null;

    /**
     * create an entry in keychain for each algo
     */
    this.keychain = {};
    this.build_keychain();
}

EchoesCrypto.prototype = Object.create(EchoesObject.prototype);
EchoesCrypto.prototype.constructor = EchoesCrypto;

/**
 * Create an entry in the keychain for every algo
 *
 * @see EchoesCrypto#algo
 *
 * @returns {null}
 */
EchoesCrypto.prototype.build_keychain = function() {
    for (var algo in this.algo) {
        this.keychain[algo] = {
            key: null,
            public_key: null,
            private_key: null,
            imported: {
                public_key: null,
                private_key: null,
                hash: null,
                key: null,
            },
            exported: {
                public_key: null,
                private_key: null,
                hash: null,
                key: null,
            }
        };
    }
};

/**
 * Generates a keypair defined by a particular known algo/keychain type
 *
 * Values: ['keyx','asym','sym','sign']
 *
 * If successful, resulting key(s) will be stored in their respective keychain
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#algo
 * @see EchoesCrypto#keychain
 *
 * @param   {string} keychain_type  Algo/Keychain type
 * @param   {bool} extractable      (default='false') Allow private/secret key extraction?
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.generate_key = function(keychain_type, extractable) {
    extractable = extractable || false;

    var keychain = null;
    var keygen_algo = null;
    var key_usage = null;
    var self = this;

    switch (keychain_type) {
        case 'asym':
            key_usage = ['encrypt', 'decrypt'];
            keygen_algo = this.algo.asym;
            keychain = this.keychain.asym;
        break;
        case 'sign':
            key_usage = ['sign', 'verify'];
            keygen_algo = this.algo.sign;
            keychain = this.keychain.sign;
        break;
        case 'sym':
            key_usage = ['encrypt', 'decrypt'];
            keygen_algo = this.algo.sym;
            keychain = this.keychain.sym;
        break;
        case 'keyx':
            key_usage = ['deriveKey'];
            keygen_algo = this.algo.keyx;
            keychain = this.keychain.keyx;
        break;
    }

    this.log('generating ' + keychain_type + ' key: '+ JSON.stringify(keygen_algo) + ' / ' + JSON.stringify(key_usage), 1);

    return crypto.subtle.generateKey(keygen_algo, extractable, key_usage)
        .then(function(k) {
            if (k.publicKey) keychain.public_key = k.publicKey;
            if (k.privateKey) keychain.private_key = k.privateKey;
            if (k.type == 'secret') keychain.key = k;
            self.log('keygen successful for ' + keychain_type + ' keychain', 0);
            return Promise.resolve();
        })
        .catch(function(e) {
            self.log('keygen error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Export a key defined by a particular known algo/keychain type.
 * For DER exports, result is converted to PEM
 *
 * Export keychain values: ['keyx_public','asym_public','sign_public','sign_private','sym']
 *
 * Export types: ['spki','pkcs8','jwk']
 * - spki for public_key->pem
 * - pkcs8 for private_key->pem
 * - jwk for pub/priv->json
 * - raw for secret->hex
 *
 * If successful, exported keys will be stored in {keychain}.exported.*
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#algo
 *
 * @param   {string} keychain   Algo/Keychain to use and key type (keyx_public, sign_public)
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.export_key = function(keychain) {
    var self = this;
    var key = null;
    var exported = null;
    var export_format = 'spki';

    switch (keychain) {
        case 'asym_public':
            key = this.keychain.asym.public_key;
            exported = this.keychain.asym.exported;
        break;
        case 'keyx_public':
            key = this.keychain.keyx.public_key;
            exported = this.keychain.keyx.exported;
        break;
        case 'sign_public':
            key = this.keychain.sign.public_key;
            exported = this.keychain.sign.exported;
        break;
        case 'sign_private':
            key = this.keychain.sign.private_key;
            exported = this.keychain.sign.exported;
            export_format = 'pkcs8';
        break;
        case 'sym':
            key = this.keychain['sym'].key;
            exported = this.keychain['sym'].exported;
            export_format = 'raw';
        break;
    }

    return crypto.subtle.exportKey(export_format, key)
        .then(function(k) {
            switch (keychain) {
                case 'asym_public':
                case 'keyx_public':
                case 'sign_public':
                    exported.public_key = self.ab_to_pem(k);
                break;
                case 'sign_private':
                    exported.private_key = self.ab_to_pem(k, 'PRIVATE');
                break;
                case 'sym':
                    exported.key = self.bytes_to_hex(k);
                break;
            }

            self.log(keychain + ' key exported to keychain', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('export error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Import a pem formatted key into keychain
 *
 * Import keychain values: ['keyx','asym','sign','sym']
 *
 * Import types: ['spki','pkcs8']
 * - spki for pem->CryptoKey
 * - pkcs8 for pem->CryptoKey
 * - raw for hex->CryptoKey
 *
 * If successful, imported keys will be stored in {keychain}.imported.*
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#algo
 *
 * @param   {string} keychain       Algo/Keychain type and key type
 * @param   {string} key            PEM formatted key
 * @param   {string} type           (default='spki') Key format type to use for import
 * @param   {bool}   extractable    (default='false') Allow extraction of private/secret key?
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.import_key = function(keychain, key, type, extractable) {
    extractable = extractable || false;
    type = type || 'spki';

    if (typeof key == 'undefined'
        || key === null
        || key === '') {
        return Promise.reject('Invalid key: ' + JSON.stringify(key));
    }

    var self = this;

    var keychain_imported = null;
    var keygen_algo = null;
    var key_ops = [];

    switch (keychain) {
        case 'asym':
            keygen_algo = this.algo.asym;
            keychain_imported = this.keychain.asym.imported;
            key_ops = (type == 'pkcs8' ? ['decrypt'] : ['encrypt']);
        break;
        case 'keyx':
            keygen_algo = this.algo.keyx;
            keychain_imported = this.keychain.keyx.imported;
            key_ops = [];
        break;
        case 'sign':
            keygen_algo = this.algo.sign;
            keychain_imported = this.keychain.sign.imported;
            key_ops = (type == 'pkcs8' ? ['sign'] : ['verify']);
        break;
        case 'sym':
            keygen_algo = this.algo.sym;
            keychain_imported = this.keychain.sym.imported;
            key_ops = ['encrypt', 'decrypt'];
        break;
    }

    // parse key data based on type
    switch (type) {
        case 'spki':
        case 'pkcs8':
            key = this.pem_to_ab(key);
        break;
        case 'raw':
            key = this.hex_to_bytes(key);
        break;
    }

    this.log('importing ' + type + ' key with params: ' + JSON.stringify(keygen_algo) + ' / ' + key_ops, 0);

    return crypto.subtle.importKey(type, key, keygen_algo, extractable, key_ops)
        .then(function(k) {
            switch(k.type) {
                case 'public':
                    keychain_imported.public_key = k;
                break;
                case 'private':
                    keychain_imported.private_key = k;
                break;
                default:
                    keychain_imported.key = k;
                break;
            }
            self.log(k.type + ' key imported to ' + keychain + ' keychain', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('import error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Produce a hex string formatted hash of first string input
 *
 * If successful, a hex string is stored in this.resulting_hash
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#algo.digest
 * @see EchoesCrypto#resulting_hash
 *
 * @param   {string} data Text to digest
  *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.hash = function(data) {
    if (typeof data != 'string') {
        data = JSON.stringify(data);
    }
    var self = this;

    return crypto.subtle.digest(this.algo.digest, this.string_to_ab(data))
        .then(function(h) {
            self.resulting_hash = self.bytes_to_hex(h);
            self.log('resulting hash saved to self.resulting_hash (' + data + ' -> ' + self.resulting_hash + ')', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('hash error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Produce binary string signature of data and store it in this.resulting_signature
 *
 * This method does not base64 encode the signature
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#algo.sign
 * @see EchoesCrypto#resulting_signature
 *
 * @param   {string} data   Text to sign
 * @param   {CryptoKey} private_key   CryptoKey object representing the private key
  *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.sign = function(data, private_key) {
    if (typeof data != 'string') {
        data = JSON.stringify(data);
    }
    var self = this;

    return crypto.subtle.sign(this.algo.sign, private_key, this.string_to_ab(data))
        .then(function(s) {
            self.resulting_signature = self.ab_to_string(s);
            self.log('resulting signature saved to self.resulting_signature (' + data + ' -> ' + btoa(self.resulting_signature) + ')', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('sign error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Generate a symmetric key using the two private/public (CryptoKey) parameters
 *
 * For hkdf method, private_key is the HKDF basekey after import, public_key is not used
 *
 * If successful, store result in this.derived_key as CryptoKey object
 *
 * Methods: ['keyx','hkdf']
 *
 * salt is a hex string representation of a 128bit array
 * info is a hex string representation of a 128bit array
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#algo.keyx
 * @see EchoesCrypto#algo.hkdf
 * @see EchoesCrypto#derived_key
 *
 * @param   {CryptoKey} private_key     Object representing a private key (or basekey for hkdf)
 * @param   {CryptoKey} public_key      Object representing a public key
 * @param   {bool} extractable          (default='false') Allow secret key extraction?
 * @param   {string} method             (default='keyx') Method to use for key derivation
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.derive_key = function(private_key, public_key, extractable, method, salt, info) {
    extractable = extractable || false;
    method = method || 'keyx';

    var derive_algo = null;
    switch(method) {
        case 'hkdf':
            if (! salt) {
                return Promise.reject('Invalid salt');
            }
            if (! info) {
                return Promise.reject('Invalid info');
            }
            derive_algo = this.algo.hkdf;
            derive_algo.salt = this.hex_to_bytes(salt);
            derive_algo.info = this.hex_to_bytes(info);
        break;
        case 'keyx':
            if (public_key === null) {
                return Promise.reject('Invalid public key');
            }
            if (private_key === null) {
                return Promise.reject('Invalid private key');
            }

            derive_algo = {
                name: this.algo.keyx.name,
                public: public_key
            };
        break;
    }

    var self = this;

    return crypto.subtle.deriveKey(derive_algo, private_key, this.algo.derive, extractable, ['encrypt', 'decrypt'])
        .then(function(k) {
            self.derived_key = k;
            self.log('derived ' + method + ' key saved to self.derived_key', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('derive ' + method + ' key error: ' + e.toString() + ' (' + JSON.stringify(derive_algo) + ')', 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Perform symmetric encryption operation on data. To properly encrypt unicode data, it is first
 * converted to base64 using the MDN uriEncode/Decode/escape technique (this.uni_encode() method).
 *
 * The resulting base64 text is encrypted. On the other end, the segment(s) are decrypted and
 * resulting plaintext run through this.uni_decode()
 *
 * A new IV is generated each time this is called.
 * A new AAD value is generated each time this is called.
 * The hex'd IV is always the first element of this.encrypted_segments (passed in cleartext)
 * The hex'd AAD is always the second element of this.encrypted_segments (passed in cleartext)
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#uni_encode
 * @see EchoesCrypto#uni_decode
 * @see EchoesCrypto#encrypted_segments
 * @see EchoesCrypto#new_iv
 * @see EchoesCrypto#algo.derive
 *
 * @param   {string} data           Text to encrypt
 * @param   {CryptoKey} symkey      Object representing a symmetric key
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.encrypt_sym = function(data, symkey) {
    var self = this;
    var iv = this.new_iv(this.algo.derive.length);
    var aad = this.new_iv(this.algo.derive.length);

    var algo = {
        name: this.algo.derive.name,
        iv: iv,
        additionalData: aad,
        tagLength: this.algo.derive.tagLength,
    };

    if (typeof data != 'string'
        && !(data instanceof String)) {
        data = '';
    }

    data = this.uni_encode(data);

    this.encrypted_segments = [];

    return crypto.subtle.encrypt(algo, symkey, this.string_to_ab(data))
        .then(function(k) {
            var encoded_iv = self.bytes_to_hex(iv);
            var encoded_aad = self.bytes_to_hex(aad);

            self.encrypted_segments.push(encoded_iv); // first up is the IV
            self.encrypted_segments.push(encoded_aad); // second element is the additionalData

            self.encrypted_segments.push(btoa(self.ab_to_string(k))); // btoa for easy network transfer
            self.log('encrypted data pushed to self.encrypted_segments, iv: ' + encoded_iv + ', aad: ' + encoded_aad, 0);

            return Promise.resolve();
        })
        .catch(function(e){
            self.log('encrypt_sym error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Perform symmetric decryption operation on data.
 *
 * Data segments are decrypted and the result joined together to form a plaintext base64 encoding
 * The base64 encoding is then run through this.uni_decode() to produce human-readable data
 *
 * Resulting human-readable data is stored in this.decrypted_text
 *
 * The first element of the data segments array is assumed to be the hex'd IV
 * The second element of the data segments array is assumed to be the hex'd AAD
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#uni_encode
 * @see EchoesCrypto#uni_decode
 * @see EchoesCrypto#derypted_segments
 * @see EchoesCrypto#derypted_text
 * @see EchoesCrypto#algo.derive
 *
 * @param   {Array} data_segments   An array of data segments to decrypt
 * @param   {CryptoKey} symkey      Object representing a symmetric key
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.decrypt_sym = function(data_segments, symkey) {
    var self = this;

    var encoded_iv = data_segments[0]; // fetch and remove the first array element, our IV
    data_segments.shift();
    var encoded_aad = data_segments[0]; // fetch and remove the second array element, our additionalData
    data_segments.shift();

    var iv = this.hex_to_bytes(encoded_iv); // convert the iv to arraybuffer
    var aad = this.hex_to_bytes(encoded_aad); // convert the aad to arraybuffer

    var algo = {
        name: this.algo.derive.name,
        iv: iv,
        additionalData: aad,
        tagLength: this.algo.derive.tagLength,
    };

    this.decrypted_segments = [];

    data_segments[0] = atob(data_segments[0]);

    return crypto.subtle.decrypt(algo, symkey, this.string_to_ab(data_segments[0]))
        .then(function(k) {
            self.decrypted_segments.push(self.ab_to_string(k));
            self.log('decrypted data pushed to self.decrypted_data, iv: ' + encoded_iv + ', aad: ' + encoded_aad, 0);

            self.decrypted_text = self.uni_decode(self.decrypted_segments.join(''));
            self.log('decrypted data saved to self.decrypted_text', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('decrypt_sym error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Perform asymmetric encryption operation on data. To properly encrypt unicode data, it is first
 * converted to base64 using the MDN uriEncode/Decode/escape technique (this.uni_encode() method).
 *
 * The resulting base64 text is encrypted. On the other end, the segment(s) are decrypted and
 * resulting plaintext run through this.uni_decode()
 *
 * The data to be encrypted is split into 64byte chunks due to RSA pk encryption limits.
 * The method runs recursively until it runs out of chunks to encrypt.
 *
 * Each chunk is base64 encoded for easier network transmit.
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#uni_encode
 * @see EchoesCrypto#uni_decode
 * @see EchoesCrypto#encrypted_segments
 * @see EchoesCrypto#algo.asym
 *
 * @param   {string} data               Text to encrypt
 * @param   {CryptoKey} public_key      Object representing a public key
 * @param   {Array} leftovers           An array of left over chunks to encrypt (auto populated)
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.encrypt_asym = function(data, public_key, leftovers) {
    var self = this;

     // someone's trying to encrypt a non-string
    if (typeof data != 'string'
        && ! (data instanceof String)
        && typeof leftovers != 'object') {
        data = '';
    }

    if (data !== null) {
        this.log('splitting b64 encoded data into segments...', 0);
        this.encrypted_segments = [];
        leftovers = this.uni_encode(data).match(/.{1,64}/g);
        if (leftovers === null) { // data was ''
            leftovers = ['']; // since .match returns null, set it to a 1 element array with empty string
        }
    }

    return crypto.subtle.encrypt(this.algo.asym, public_key, this.string_to_ab(leftovers[0]))
        .then(function(k) {
            leftovers.shift();

            self.encrypted_segments.push(btoa(self.ab_to_string(k))); // btoa for network transmit
            self.log('encrypted data pushed to self.encrypted_segments, segments left to encrypt: ' + leftovers.length, 0);

            return (leftovers.length > 0 ? self.encrypt_asym(null, public_key, leftovers) : Promise.resolve());
        })
        .catch(function(e){
            self.log('encrypt_asym error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Perform asymmetric decryption operation on data segments array. Each segment is base64 encoded
 * for easy network transmit.
 *
 * The decrypted data segments are stored in this.decrypted_segments.
 * Once all chunks are decrypted, the resulting this.uni_decode()ed text is
 * stored in this.decrypted_text
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @see EchoesCrypto#uni_encode
 * @see EchoesCrypto#uni_decode
 * @see EchoesCrypto#decrypted_segments
 * @see EchoesCrypto#algo.asym
 *
 * @param   {Array} data_segments       Data segments to decrypt
 * @param   {CryptoKey} private_key     Object representing a private key
 * @param   {Array} leftovers           An array of left over chunks to decrypt (auto populated)
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.decrypt_asym = function(data_segments, private_key, leftovers) {
    var self = this;

    if (data_segments !== null) {
        this.decrypted_segments = [];
        this.decrypted_text = null;
        leftovers = data_segments.slice();
    }

    leftovers[0] = atob(leftovers[0]); // b64 decode chunk before decryption

    return crypto.subtle.decrypt(this.algo.asym, private_key, this.string_to_ab(leftovers[0]))
        .then(function(k) {
            leftovers.shift();

            self.decrypted_segments.push(self.ab_to_string(k));
            self.log('decrypted data pushed to self.decrypted_data, segments left to decrypt: ' + leftovers.length, 0);

            if (leftovers.length === 0) {
                self.decrypted_text = self.uni_decode(self.decrypted_segments.join(''));
            }
            return (leftovers.length > 0 ? self.decrypt_asym(null, private_key, leftovers) : Promise.resolve());
        })
        .catch(function(e){
            self.log('decrypt_asym error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
};

/**
 * Wrapper for either symmetric or asymmetric encryption
 *
 * If a symkey object is specified, symmetric encryption is performed,
 * otherwise default to asymmetric encryption.
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @param   {string} data Text to encrypt
 * @param   {CryptoKey} public_key   Object representing a public key
 * @param   {CryptoKey} symkey       Object representing a symmetric key
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.encrypt = function(data, public_key, symkey) {
    if (typeof symkey != 'undefined'
        && symkey !== null) {
        return this.encrypt_sym(data, symkey);
    } else {
        return this.encrypt_asym(data, public_key);
    }
};

/**
 * Wrapper for either symmetric or asymmetric decryption
 *
 * If a symkey object is specified, symmetric decryption is performed,
 * otherwise default to asymmetric decryption.
 *
 * Handle returning Promise object using .then(r) and .catch(e)
 *
 * @param   {Array} data                Data segments to decrypt
 * @param   {CryptoKey} private_key     Object representing a private key
 * @param   {CryptoKey} symkey          Object representing a symmetric key
 *
 * @returns {Promise} Either a .resolve(null) or .reject('error message')
 */
EchoesCrypto.prototype.decrypt = function(data_segments, private_key, symkey) {
    if (typeof symkey != 'undefined'
        && symkey !== null) {
        return this.decrypt_sym(data_segments, symkey);
    } else {
        return this.decrypt_asym(data_segments, private_key);
    }
};

/**
 * Generate an ArrayBuffer of [length] (in bits) random data
 *
 * @param   {integer} length    Length of buffer in bits (eg: 128, this.algo.derive.length)
 *
 * @returns {ArrayBuffer} Array buffer containing random integer values
 */
EchoesCrypto.prototype.new_iv = function(length) { // in bits, hence the /8
    return crypto.getRandomValues(new Uint8Array(length / 8));
};

/**
 * MDN hack to encode/decode unicode properly
 *
 * escape()/unescape() is deprecated so... you know.. figure out another way to do this
 *
 * @param   {string} str    Description
 *
 * @returns {string} Base64 decoded unicode text
 */
EchoesCrypto.prototype.uni_decode = function(str) {
    return decodeURIComponent(escape(atob(str)));
};
/**
 * MDN hack to encode/decode unicode properly
 *
 * escape()/unescape() is deprecated so... you know.. figure out another way to do this
 *
 * @param   {string} str    Description
 *
 * @returns {string} Base64 encoded unicode text
 */
EchoesCrypto.prototype.uni_encode = function(str) {
    return btoa(unescape(encodeURIComponent(str)));
};

/**
 * Convert array buffer to string
 *
 * @param   {ArrayBuffer} buffer Buffer to convert
 *
 * @returns {string} String representation of buffer
 */
EchoesCrypto.prototype.ab_to_string = function(buffer) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer));
};

/**
 * Convert string to array buffer
 *
 * @param   {string} str String to convert
 *
 * @returns {ArrayBuffer} Array buffer representation of string
 */
EchoesCrypto.prototype.string_to_ab = function(str) {
    var buffer = new ArrayBuffer(str.length);
    var view = new Uint8Array(buffer);
    for (var i=0; i < str.length; i++) {
        view[i] = str.charCodeAt(i);
    }
    return buffer;
};

/**
 * Convert array buffer to hex values
 *
 * @param   {ArrayBuffer} buffer Buffer to convert
 *
 * @returns {string} Hex representation of array buffer
 */
EchoesCrypto.prototype.bytes_to_hex = function(buffer) {
    if (! buffer) {
        return null;
    }

    buffer = new Uint8Array(buffer);
    var hex = [];
    for (var i = 0; i < buffer.length; ++i) {
        var str = buffer[i].toString(16);
        if (str.length < 2) {
            str = "0" + str;
        }

        hex.push(str);
    }
    return hex.join('');
};

/**
 * Convert hex string to array buffer
 *
 * @param   {string} hex Hex string to convert
 *
 * @returns {ArrayBuffer} Array buffer of hex string
 */
EchoesCrypto.prototype.hex_to_bytes = function(hex) {
    if (hex.length % 2 !== 0) {
        throw "Invalid hex string";
    }
    var ab = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2) {
        var val = parseInt(hex.substr(i, 2), 16);
        if (isNaN(val)) {
            this.log('invalid hex string in hext_to_bytes conversion: ' + hex, 3);
            return null;
        }
        ab[i/2] = val;
    }
    return ab;
};

/**
 * Convert pem format (DER) into array buffer
 *
 * The method strips the PEM begin/end tags, and calls
 * this.base64_to_ab()
 *
 * @see EchoesCrypto#base64_to_ab
 *
 * @param   {string} pem PEM formatted string of key to convert
 *
 * @returns {ArrayBuffer} Array buffer representation of DER encoding
 */
EchoesCrypto.prototype.pem_to_ab = function(pem) {
    var base64 = pem.trim().split(/[\r\n]+/g);
    base64.shift(); // remove -begin-
    base64.pop(); // remove -end-
    base64 = base64.join('');

    return this.base64_to_ab(base64);
};

/**
 * Convert array buffer into PEM formatted string
 *
 * The method calls this.ab_to_base64() before attaching
 * PEM begin/end tags to 64 byte chunks (split by \n)
 *
 * Type values: ['PRIVATE', 'PUBLIC', 'EC PRIVATE', 'CERTIFICATE', 'WHATEVER']
 *
 * @see EchoesCrypto#ab_to_base64
 *
 * @param   {ArrayBuffer} ab    Array buffer of DER encoding
 * @param   {string} type       (defualt='PUBLIC') key type (PRIVATE, EC PRIVATE, PUBLIC, etc)
 *
 * @returns {string} PEM formatted string representation of array buffer (DER encoding hopefully)
 */
EchoesCrypto.prototype.ab_to_pem = function(ab, type) {
    type = type || "PUBLIC";
    var base64 = this.ab_to_base64(ab);

    var pem = "-----BEGIN " + type.toUpperCase() + " KEY-----\n";
    pem += base64.match(/.{1,64}/g).join("\n");
    pem += "\n-----END " + type.toUpperCase() + " KEY-----\n";

    return pem;
};

/**
 * Base64 encode an array buffer
 *
 * @param   {ArrayBuffer} ab Array buffer to base64 encode
 *
 * @returns {string} Base64 encoding of Array Buffer
 */
EchoesCrypto.prototype.ab_to_base64 = function(ab) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(ab)));
};
/**
 * Base64 decode an array buffer. Newline characters are stripped first.
 *
 * @param   {string} base64     Base64 encoded string representation of an array buffer
 *
 * @returns {ArrayBuffer} Array buffer representation of a string
 */
EchoesCrypto.prototype.base64_to_ab = function(base64) {
    base64 = base64.replace(/(\r\n|\n|\r)/gm, '');
    return new Uint8Array(Array.prototype.map.call(atob(base64), function (c) { return c.charCodeAt(0); }));
};

/**
 * Utility to check browser support for various features
 *
 * feature values: ['ec','crypto']
 *
 * If the browser is known and version greater than baseline, *.supported is marked as 'true'
 *
 * @param   {string} feature    What feature to check for
 *
 * @returns {bool} Is the feature supported?
 */
EchoesCrypto.prototype.does_browser_support = function(feature) { // "crypto", "ec"
    var ua = navigator.userAgent.split(/[\s|\/]/g);
    var known_browsers = this.browser_support[feature].known;

    for (var browser in known_browsers) {
        var version = parseFloat(ua[ua.indexOf(browser) + 1]);
        if (! isNaN(version)) {
            var supported = (version >= known_browsers[browser]);
            this.log("browser '" + browser + "' (" + version + ") supports " + feature + ": " + supported + " (min: " + known_browsers[browser] + ")", 0);
            this.browser_support[feature].supported = supported;
            return supported;
        }
    }

    this.browser_support[feature].supported = false;
    this.log("browser marked as unsupported for feature: " + feature, 0);
    return false;
};
