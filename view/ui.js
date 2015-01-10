function EchoesUi() {
    EchoesObject.call(this, 'ui');

    this.ui = {
        window: $("#window"),
        echoes: $("#echoes"),
        input: $('#e'),
        channels: $('#c'),
        form: $('form'),
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

EchoesUi.prototype.active_channel = function() {
    return this.ui.channels.find('option:selected');
}

EchoesUi.prototype.joined_channels = function() {
    return this.ui.channels.find('option');
}

EchoesUi.prototype.remove_channel = function(chan) {
    $ui.channels.find("option[value='" + chan + "']").remove();
}

EchoesUi.prototype.clear_channels = function() {
    $ui.channels.html('');
}

EchoesUi.prototype.add_channel = function(chan) {
    $ui.channels.append(
        $('<option>')
            .val(chan)
            .html(chan)
            .attr('selected', 'selected')
    );
}
