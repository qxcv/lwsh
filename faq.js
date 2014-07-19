if (Meteor.isClient) {
    Meteor.startup(function() {
        $('#faqbox .close, #blackout').click(function() {
            /* Close the FAQ box */
            $("#faqbox, #blackout").hide();
        });

        $('#helpbutton').click(function() {
            /* Open the FAQ box */
            $("#faqbox, #blackout").show();
        });
    });
}
