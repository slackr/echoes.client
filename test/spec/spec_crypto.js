describe("EchoesCrypto", function() {
    var c = new EchoesCrypto();
    var test_keychains = ['encrypt', 'keyx', 'sign']

    AppConfig.CONSOLE_LOG = true;
    AppConfig.LOG_LEVEL = 0;

    c.does_browser_support('crypto');
    c.does_browser_support('ec');

    /**
     * Loop test keychains
     */
    var test_genkey = function(kc) {
        console.log(c);
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

            c.generate_key(kc)
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

            c.export_key(kc + '_public')
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
            c.resulting_hash = null;
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


});
