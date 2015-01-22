/**
 * from https://chromium.googlesource.com/chromium/blink/+/master/LayoutTests/crypto/subtle
 * and http://kjur.github.io/jsjws/tool_b64udec.html
 */

function EchoesCrypto() {
    EchoesObject.call(this, 'crypto');

    this.keygen_encrypt_algo = {
        name: 'RSA-OAEP',
        hash: {name: 'sha-256'},
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),  // Equivalent to 65537
    };
    this.keygen_keyx_algo = { // diffiehellman key exchange
        name: "ECDH",
        namedCurve: "P-256"
    };
    this.keygen_sign_algo = {
        name: "ECDSA",
        namedCurve: "P-256"
    };

    this.keygen_symcrypt_algo = {
        name: 'AES-GCM',
        length: 128,
    }

    this.digest_algo = {
        name: "SHA-1",
    }
    this.derive_algo = {
        name: 'AES-CBC',
        length: 128
    }

    this.keychain = {
        sign: {
            public_key: null,
            private_key: null,
            imported: {
                public_key: null,
                private_key: null,
                hash: null,
            },
            exported: {
                public_key: null,
                private_key: null,
                hash: null,
            }
        },
        encrypt: {
            public_key: null,
            private_key: null,
            imported: {
                public_key: null,
                private_key: null,
                hash: null,
            },
            exported: {
                public_key: null,
                private_key: null,
                hash: null,
            }
        },
        keyx: {
            public_key: null,
            private_key: null,
            imported: {
                public_key: null,
                private_key: null,
                hash: null,
            },
            exported: {
                public_key: null,
                private_key: null,
                hash: null,
            }
        },
        symcrypt: {
            key: null,
            imported: {
                key: null,
            },
            exported: {
                key: null,
            }
        },
    };

    this.browser_support = {
        crypto: {
            known: {
                'Chrome': 39,
                'Firefox': 35,
            },
            supported: false,
        },
        ec: {
            known: {
                'Chrome': 42,
                'Firefox': 35,
            },
            supported: false,
        }
    };

    this.encrypted_segments = [];
    this.decrypted_segments = [];
    this.decrypted_text = null;
    this.resulting_hash = null;
    this.derived_key = null;
}

EchoesCrypto.prototype = Object.create(EchoesObject.prototype);
EchoesCrypto.prototype.constructor = EchoesCrypto;

EchoesCrypto.prototype.generate_key = function(keychain_type, extractable) {
    extractable = extractable || false;

    var keychain = null;
    var keygen_algo = null;
    var key_usage = null;
    var self = this;

    switch (keychain_type) {
        case 'encrypt':
            key_usage = ['encrypt', 'decrypt'];
            keygen_algo = this.keygen_encrypt_algo;
            keychain = this.keychain.encrypt;
        break;
        case 'sign':
            key_usage = ['sign', 'verify'];
            keygen_algo = this.keygen_sign_algo;
            keychain = this.keychain.sign;
        break;
        case 'symcrypt':
            key_usage = ['encrypt', 'decrypt'];
            keygen_algo = this.keygen_symcrypt_algo;
            keychain = this.keychain.symcrypt;
        break;
        case 'keyx':
            key_usage = ['deriveKey'];
            keygen_algo = this.keygen_keyx_algo;
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
}
EchoesCrypto.prototype.export_key = function(keychain) {
    var self = this;
    var key = null;
    var exported = null;

    switch (keychain) {
        case 'encrypt_public':
            key = this.keychain.encrypt.public_key;
            exported = this.keychain.encrypt.exported;
        break;
        case 'keyx_public':
            key = this.keychain.keyx.public_key;
            exported = this.keychain.keyx.exported;
        break;
        case 'sign_public':
            key = this.keychain.sign.public_key;
            exported = this.keychain.sign.exported;
        break;
        case 'symcrypt':
            key = this.keychain.symcrypt.key;
            exported = this.keychain.symcrypt.exported;
        break;
    }

    return crypto.subtle.exportKey('jwk', key)
        .then(function(k) {
            if (keychain == 'symcrypt') exported.key = k;
            if (keychain == 'encrypt_public'
                || keychain == 'sign_public'
                || keychain == 'keyx_public') exported.public_key = k;

            self.log(keychain + ' key exported to keychain', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('export error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.import_jwk_key = function(keychain, jwk_key) {
    if (jwk_key == null
        || typeof jwk_key.kty == 'undefined'
        || typeof jwk_key.ext == 'undefined') {
        return Promise.reject('Invalid JWK key: ' + JSON.stringify(jwk_key));
    }

    var keychain_imported = null;
    var keygen_algo = null;
    var self = this;

    switch (keychain) {
        case 'encrypt':
            keygen_algo = {
                name: this.keygen_encrypt_algo.name,
                hash: this.keygen_encrypt_algo.hash,
            };
            keychain_imported = this.keychain.encrypt.imported;
        break;
        case 'keyx':
            keygen_algo = this.keygen_keyx_algo;
            keychain_imported = this.keychain.keyx.imported;
        break;
        case 'sign':
            keygen_algo = this.keygen_sign_algo;
            keychain_imported = this.keychain.sign.imported;
        break;
        case 'symcrypt':
            keygen_algo = this.keygen_symcrypt_algo;
            keychain_imported = this.keychain.symcrypt.imported;
        break;
    }

    return crypto.subtle.importKey('jwk', jwk_key, keygen_algo, jwk_key.ext, jwk_key.key_ops || [])
        .then(function(k) {
            switch(k.type) {
                case 'public':
                    keychain_imported.public_key = k;
                break;
                case 'private':
                    keychain_imported.private_key = k;
                break;
                case 'secret':
                    keychain_imported.key = k;
                break;
            }
            self.log(k.type + ' key imported ' + keychain + ' keychain', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('import error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.hash = function(data) {
    if (typeof data != 'string') {
        data = JSON.stringify(data);
    }
    var self = this;

    return crypto.subtle.digest(this.digest_algo, this.string_to_ab(data))
        .then(function(h) {
            self.resulting_hash = self.bytes_to_hex(h);
            self.log('resulting hash saved to self.resulting_hash (' + data + ' -> ' + self.resulting_hash + ')', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('hash error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.derive_key = function(private_key, public_key, extractable) {
    extractable = extractable || false;

    if (public_key == null) {
        return Promise.reject('Invalid public key');
    }
    if (private_key == null) {
        return Promise.reject('Invalid private key');
    }

    var self = this;

    return crypto.subtle.deriveKey({name: this.keygen_keyx_algo.name, public: public_key}, private_key, this.derive_algo, extractable, ['encrypt', 'decrypt'])
        .then(function(k) {
            self.derived_key = k;
            self.log('derived key saved to self.derived_key', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('derive key error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.encrypt_sym = function(data, symkey) {
    var self = this;
    var iv = this.new_iv(this.derive_algo.length);
    var algo = { name: this.derive_algo.name, iv: iv };

    data = this.uni_encode(data);

    this.encrypted_segments = [];

    return crypto.subtle.encrypt(algo, symkey, this.string_to_ab(data))
        .then(function(k) {
            var encoded_iv = self.bytes_to_hex(iv);
            self.encrypted_segments.push(encoded_iv); // first up is the IV
            self.encrypted_segments.push(btoa(self.ab_to_string(k))); // btoa again
            self.log('encrypted data pushed to self.encrypted_segments, iv ' + encoded_iv, 0);

            return Promise.resolve();
        })
        .catch(function(e){
            self.log('encrypt_sym error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.encrypt = function(data, public_key, symkey) {
    if (typeof symkey != 'undefined'
        && symkey != null) {
        return this.encrypt_sym(data, symkey);
    } else {
        return this.encrypt_asym(data, public_key);
    }
}

EchoesCrypto.prototype.decrypt = function(data, private_key, symkey) {
    if (typeof symkey != 'undefined'
        && symkey != null) {
        return this.decrypt_sym(data, symkey);
    } else {
        return this.decrypt_asym(data, private_key);
    }
}

EchoesCrypto.prototype.encrypt_asym = function(data, public_key, leftovers) {
    var self = this;

    if (data != null) {
        this.log('splitting b64 encoded data into segments...', 0);
        this.encrypted_segments = [];
        leftovers = this.uni_encode(data).match(/.{1,64}/g);
    }

    return crypto.subtle.encrypt(this.keygen_encrypt_algo, public_key, this.string_to_ab(leftovers[0]))
        .then(function(k) {
            leftovers.shift();

            self.encrypted_segments.push(btoa(self.ab_to_string(k))); // btoa again
            self.log('encrypted data pushed to self.encrypted_segments, segments left to encrypt: ' + leftovers.length, 0);

            return (leftovers.length > 0 ? self.encrypt_asym(null, public_key, leftovers) : Promise.resolve());
        })
        .catch(function(e){
            self.log('encrypt_asym error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.decrypt_sym = function(data_segments, symkey) {
    var self = this;

    var encoded_iv = data_segments[0];
    data_segments.shift();

    var iv = this.hex_to_bytes(encoded_iv); // parse the iv to arraybuffer
    var algo = { name: this.derive_algo.name, iv: iv };

    this.decrypted_segments = [];

    data_segments[0] = atob(data_segments[0]);

    return crypto.subtle.decrypt(algo, symkey, this.string_to_ab(data_segments[0]))
        .then(function(k) {
            self.decrypted_segments.push(self.ab_to_string(k));
            self.log('decrypted data pushed to self.decrypted_data, iv: ' + encoded_iv, 0);

            self.decrypted_text = self.uni_decode(self.decrypted_segments.join(''));
            self.log('decrypted data saved to self.decrypted_text', 0);
            return Promise.resolve();
        })
        .catch(function(e){
            self.log('decrypt_sym error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}

EchoesCrypto.prototype.decrypt_asym = function(data_segments, private_key) {
    var self = this;

    data_segments[0] = atob(data_segments[0]); // b64 decode chunk before decryption

    return crypto.subtle.decrypt(this.keygen_encrypt_algo, private_key, this.string_to_ab(data_segments[0]))
        .then(function(k) {
            data_segments.shift();

            self.decrypted_segments.push(self.ab_to_string(k));
            self.log('decrypted data pushed to self.decrypted_data, segments left to decrypt: ' + data_segments.length, 0);

            if (data_segments.length == 0) {
                self.decrypted_text = self.uni_decode(self.decrypted_segments.join(''));
            }
            return (data_segments.length > 0 ? self.decrypt_asym(data_segments, private_key) : Promise.resolve());
        })
        .catch(function(e){
            self.log('decrypt_asym error: ' + e.toString(), 3);
            return Promise.reject(e.toString());
        });
}


EchoesCrypto.prototype.new_iv = function(length) { // in bits, hence the /8
    return crypto.getRandomValues(new Uint8Array(length / 8));
}

EchoesCrypto.prototype.uni_decode = function(str) { // mdn hack to b64 encode unicode for now.. escape/unescape is deprecated
    return decodeURIComponent(escape(atob(str)));
}
EchoesCrypto.prototype.uni_encode = function(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

EchoesCrypto.prototype.ab_to_string = function(buffer) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer));
}

EchoesCrypto.prototype.string_to_ab = function(str) {
    var buffer = new ArrayBuffer(str.length);
    var view = new Uint8Array(buffer);
    for (var i=0; i < str.length; i++) {
        view[i] = str.charCodeAt(i);
    }
    return buffer;
}

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
}

EchoesCrypto.prototype.hex_to_bytes = function(hex) {
    if (hex.length % 2 != 0) {
        throw "Invalid hex string";
    }
    var ab = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2) {
        var val = parseInt(hex.substr(i, 2), 16);
        if (isNaN(val)) {
            throw "Invalid hex string";
        }
        ab[i/2] = val;
    }
    return ab;
}

EchoesCrypto.prototype.base64_to_ui8a = function(string) {
    string = string.replace(/(\r\n|\n|\r)/gm, '');
    return new Uint8Array(Array.prototype.map.call(atob(string), function (c) { return c.charCodeAt(0) }));
}

EchoesCrypto.prototype.base64u_to_base64 = function(s) {
    /**
     * credit: http://kjur.github.io/jsjws/tool_b64udec.html
     */
    if (s.length % 4 == 2) {
        s = s + "==";
    } else if (s.length % 4 == 3) {
        s = s + "=";
    }
    s = s.replace(/-/g, "+");
    s = s.replace(/_/g, "/");
    return s;
}

EchoesCrypto.prototype.does_browser_support = function(what) { // "crypto", "ec"
    var ua = navigator.userAgent.split(/[\s|\/]/g);
    var known_browsers = this.browser_support[what].known;

    for (var browser in known_browsers) {
        var version = parseFloat(ua[ua.indexOf(browser) + 1]);
        if (! isNaN(version)) {
            var supported = (version >= known_browsers[browser]);
            this.log("browser '" + browser + "' (" + version + ") supports " + what + ": " + supported + " (min: " + known_browsers[browser] + ")", 0);
            this.browser_support[what].supported = supported;
            return supported;
        }
    }

    this.browser_support[what].supported = false;
    this.log("unknown browser marked as unsupported for feature: " + what, 0);
    return false;
}
