var Auth = function() {

  var urlBase = '<ENV::apiBaseUrl>';

  var handleGdpr = function() {
    $('.gdpr-form').validate({
      errorElement: 'span', //default input error message container
      errorClass: 'help-block', // default input error message class
      focusInvalid: false, // do not focus the last invalid input
      errorLabelContainer: '.msg-error',
      ignore: "",
      rules: {
        gdpr: {
          required: true
        },
        cookies: {
          required: true
        }
      },
      messages: {
        cookies: {
          required: "Please accept Cookies Policy"
        },
        gdpr: {
          required: "Please accept GDPR Policy"
        }
      },

      invalidHandler: function(event, validator) { // display error alert on form submit
        $('.gdpr-form .alert-danger').show();
      },

      highlight: function(element) { // hightlight error inputs
        $(element).closest('.form-group').addClass('has-error'); // set error class to the control group
      },

      success: function(label) {
        label.closest('.form-group').removeClass('has-error');
        label.remove();
      },

      errorPlacement: function(error, element) {
        error.insertAfter(element.closest('.input-icon'));
      },

      submitHandler: function(form, event) {

        event.preventDefault();
        var token = $.getQuery('t');
        if (token.length > 0) {

          var data = { token: $.getQuery('t'), gdpr: true };

          $.ajax({
            url: urlBase + '/gdpr',
            data: data,
            type: 'POST',
            datatype: 'json',
            success: function(data) {
              console.log('--gdpr accept request success--');

              try {
                var response = JSON.parse(data);
                console.log(data);
              }
              catch(e) {
                console.log(e);
              }

              if (typeof(response) !== "undefined") {
                if (response.success) {
                  $('.msg-error', $('.gdpr-form')).hide();
                  $('.gdpr-form').hide();
                  console.log('--Logging in--' );
                  Auth.login();
                } else {
                  console.log(response.status);
                  $('.msg-error', $('.gdpr-form')).text('GDPR accept failed.');
                  $('.msg-error', $('.gdpr-form')).show();
                }
              }

            },
            error: function(data) {
              console.log('--gdpr accept request failure--');
              $('.msg-error', $('.gdpr-form')).text('Server error, try again later.');
              $('.msg-error', $('.gdpr-form')).show();
              console.log(data);
            }
          });

        } else {
          $("#cookies-consent").prop("checked",false);
          $("#gdpr-consent").attr('checked',false);
        }

      }
    });

    $('.gdpr-form input').keypress(function(e) {
      if (e.which == 13) {
        if ($('.gdpr-form').validate().form()) {
          $('.gdpr-form').submit();
        }
        return false;
      }
    });

    jQuery('#gdpr-reject-btn').click(function() {

      var token = $.getQuery('t');
      var data = { token: token, gdpr: false };

      $.ajax({
        url: urlBase + '/gdpr',
        data: data,
        type: 'POST',
        datatype: 'json',
        success: function(data) {
          console.log('--gdpr reject request success--');

          try {
            var response = JSON.parse(data);
            console.log(data);
          } catch(e) {
            console.log(e);
          }

          if (typeof(response) !== "undefined") {
            if (response.success) {
              $('.msg-error', $('.gdpr-form')).hide();
              $('.gdpr-form').hide();
              $('.msg-reject-success').show();
              console.log('--Deleting account--' );
            } else {
              console.log(response.status);
              $('.msg-error', $('.gdpr-form')).text('GDPR reject failed.');
              $('.msg-error', $('.gdpr-form')).show();
            }
          }
        }
      });

    });
  }

  return {
    //main function to initiate the module
    init: function() {
      // retrieve GET parameters
      var gdpr = $.getQuery('g');

      if (gdpr == "true") {
        // perform login challenge
        Auth.login();
      } else if (gdpr == "false") {
        // display gdpr form
        $('.gdpr-form').show();
        handleGdpr();
      }

      $('.gdpr-form')
    },

    login: function() {
      $('.msg-success').show();
      $.ajax({
        url: urlBase + '/login',
        type: 'POST',
        data: { token: $.getQuery('t') },
        dataType: 'json',
        xhrFields: {
          withCredentials: true
        }
      })
      .done(function(response) {
        console.log('Authorized');
        window.location = "/app/#/dashboard"
      })
      .fail(function(error) {
        console.error('Error:', error);
        //  window.history.back();
      });
    }

  };

}();

jQuery(document).ready(function() {
  (function($){
    $.getQuery = function( query ) {
      query = query.replace(/[\[]/g,"\\\[").replace(/[\]]/g,"\\\]");
      var expr = "[\\?&]"+query+"=([^&#]*)";
      var regex = new RegExp( expr );
      var results = regex.exec( window.location.href );
      if( results !== null ) {
        return results[1];
        // return decodeURIComponent(results[1].replace(/\+/g, " "));
      } else {
        return false;
      }
    };
  })(jQuery);
  Auth.init();
});
