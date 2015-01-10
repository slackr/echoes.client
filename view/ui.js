function EchoesUi() {
    EchoesObject.call(this, 'ui');

    this.ui = {
        window: $("#window"),
        echoes: $("#echoes"),
        input: $('#e'),
    }
}

EchoesUi.prototype = Object.create(EchoesObject.prototype); // inherit EchoesObject
EchoesUi.prototype.constructor = EchoesUi;

EchoesUi.prototype.scroll_down = function() {
    this.ui.window.scrollTop(this.ui.window.prop("scrollHeight"));
};

EchoesUi.prototype.echo = function(echo) {
    this.ui.echoes.append(
        $('<li>')
            .text(echo)
    );

    this.scroll_down();
    this.ui.input.focus();
};

EchoesUi.prototype.status = function(status) {
    this.echo('* ' + status)
};

EchoesUi.prototype.error = function(error) {
    this.status('ERROR: ' + error);
};
