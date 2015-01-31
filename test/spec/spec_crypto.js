describe("EchoesCrypto", function() {
    var c = new EchoesCrypto();
    var test_keychains = ['encrypt', 'keyx', 'sign']

    AppConfig.CONSOLE_LOG = true;
    AppConfig.LOG_LEVEL = 0;

    /**
     * Test synchronous functions
     */
    describe("Synchronous functions", function() {
        it("should support 'crypto' and 'ec' features", function() {
            c.does_browser_support('crypto');
            c.does_browser_support('ec');

            expect(c.browser_support['crypto'].supported).toEqual(true);
            expect(c.browser_support['ec'].supported).toEqual(true);
        });

        it("should generate two random IVs", function() {
            var iv_size = 128; // 128bit/16byte array
            var iv1 = c.new_iv(iv_size);
            var iv2 = c.new_iv(iv_size);

            expect(typeof iv1).toBe('object');
            expect(iv1.length).toEqual(iv_size / 8);
            expect(typeof iv2).toBe('object');
            expect(iv2.length).toEqual(iv_size / 8);
            expect(iv1).not.toEqual(iv2);
        });

        it("should encode and decode unicode characters properly", function() {
            var chars = "☃❄❅❆★☆✪✫✯⚝⚫⚹✵❉❋";
            var encoded = c.uni_encode(chars);
            var decoded = c.uni_decode(encoded);

            expect(decoded).toEqual(chars);
        });

        it("should create a specific hex value from a static uint8 buffer", function() {
            var buffer = new Uint8Array([69, 124, 79, 78, 100, 153, 64, 110, 156, 35, 48, 46, 49, 23, 191, 2]);
            var expected_hex = "457c4f4e6499406e9c23302e3117bf02";

            expect(c.bytes_to_hex(buffer)).toEqual(expected_hex);
        });
    });
    /**
     * Loop test keychains
     */
    var test_genkey = function(kc) {
        it("should generate a public and private keypair for '" + kc + "'", function(done) {
            var resolved = function(r) {
                expect(c.keychain[kc].private_key).not.toBe(null);
                expect(c.keychain[kc].public_key).not.toBe(null);
                done();
            };
            var rejected = function(e) {
                expect(e).toBeUndefined();
                done();
            };

            c.generate_key(kc, true)
                .then(resolved)
                .catch(rejected);
        });
    }

    var test_exportkey = function(kc) {
        it("should export public key from keychain '" + kc + "'", function(done) {
            var resolved = function(r) {
                expect(c.keychain[kc].exported.public_key).not.toBe(null);
                done();
            };
            var rejected = function(e) {
                expect(e).toBeUndefined();
                done();
            };

            c.export_key(kc + '_public', 'spki')
                .then(resolved)
                .catch(rejected);
        });
    }

    for (var i in test_keychains) {
        var kc = test_keychains[i];

        test_genkey(kc);
    }
    for (var i in test_keychains) {
        var kc = test_keychains[i];

        test_exportkey(kc);
    }

    /**
     * Hash test
     */
    var hash_test = { value: 'test', expected: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3'}
    it("should hash '" + hash_test.value + "' -> '" + hash_test.expected + "'", function(done) {
        var resolved = function(r) {
            expect(c.resulting_hash).toEqual(hash_test.expected);
            c.log('resulting hash: ' + c.resulting_hash, 1);
            done();
        };
        var rejected = function(e) {
            expect(e).toBeUndefined();
            done();
        };

        c.hash(hash_test.value)
            .then(resolved)
            .catch(rejected);
    });

    /**
     * Re-import previously exported keyx pubkey
     */
    it("should import a previously exported keyx key", function(done) {
        var resolved = function(r) {
            expect(c.keychain['keyx'].imported.public_key).not.toBe(null);
            c.log('imported key: ' + c.keychain['keyx'].imported.public_key, 1);
            done();
        };
        var rejected = function(e) {
            expect(e).toBeUndefined();
            done();
        };

        c.import_key('keyx', c.keychain['keyx'].exported.public_key, 'spki', true)
            .then(resolved)
            .catch(rejected);
    });

    /**
     * Derive symkey from re-imported keyx pubkey and existing keyx privkey
     */
    it("should derive a symkey from re-imported pubkey and privkey from keychain keyx", function(done) {
        var resolved = function(r) {
            expect(c.derived_key).not.toBe(null);
            c.log('derived key: ' + c.derived_key, 1);
            done();
        };
        var rejected = function(e) {
            expect(e).toBeUndefined();
            done();
        };

        c.derive_key(c.keychain['keyx'].private_key, c.keychain['keyx'].imported.public_key, true)
            .then(resolved)
            .catch(rejected);
    });


});
