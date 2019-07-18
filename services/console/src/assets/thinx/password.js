var PasswordReset = function() {

  var urlBase = '<ENV::apiBaseUrl>';

  var handleResetPassword = function() {
    $('.reset-form').validate({
      errorElement: 'span', //default input error message container
      errorClass: 'help-block', // default input error message class
      focusInvalid: false, // do not focus the last invalid input
      errorLabelContainer: '.msg-error',
      ignore: "",
      rules: {
        password: {
          required: true,
          minlength: 4
        },
        rpassword: {
          required: true,
          equalTo: "#password"
        }
      },
      messages: {
        password: {
          required: "Please provide a password",
          minLength: "Your password must be at least 4 characters long",
        },
        rpassword: {
          required: "Please re-type your password",
          equalTo: "Passwords must match"
        }
      },

      invalidHandler: function(event, validator) { //display error alert on form submit
          $('.reset-form .alert-danger').show();
      },

      highlight: function(element) { // hightlight error inputs
        $(element)
        .closest('.form-group').addClass('has-error'); // set error class to the control group
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

        var activation = $.getQuery('activation');
        var owner = $.getQuery('owner');
        var reset_key = $.getQuery('reset_key');

        var data = {
          password: $('.reset-form input[name=password]').val(),
          rpassword: $('.reset-form input[name=rpassword]').val(),
          owner: owner
        };

        if (activation !== false) {
          data.activation = activation;
        }

        if (reset_key !== false) {
          data.reset_key = reset_key;
        }

        $.ajax({
          url: urlBase + '/user/password/set',
          data: data,
          type: 'POST',
          datatype: 'json',
          success: function(data) {
            console.log('--password set request success--');

            try {
              var response = JSON.parse(data);
              console.log(data);
            }
            catch(e) {
              console.log(e);
            }

            if (typeof(response) !== "undefined") {
              if (response.success) {

                if (response.status == "password_reset_successful") {
                  $('.msg-error', $('.reset-form')).hide();
                  $('.reset-form').hide();
                  $('.msg-success').show();

                  console.log('--Redirecting to login--' );
                  $('.login-button').attr('href', '/');
                }
              } else {
                console.log(response.status);
                if (response.status == 'user_not_found') {
                  $('.msg-error', $('.reset-form')).text('User not found.');
                  $('.msg-error', $('.reset-form')).show();
                }
                if (response.status == 'activated_user_not_found') {
                  $('.msg-error', $('.reset-form')).text('Activated User not found.');
                  $('.msg-error', $('.reset-form')).show();
                }
              }
            }

          },
          error: function(data) {
            console.log('--password reset request failure--');

            $('.msg-error', $('.reset-form')).text('Server error, try again later.');
            $('.msg-error', $('.reset-form')).show();

            console.log(data);
          }
        });

      }
    });

    $('.reset-form input').keypress(function(e) {
      if (e.which == 13) {
        if ($('.reset-form').validate().form()) {
          $('.reset-form').submit();
        }
        return false;
      }
    });

  }

  return {
    //main function to initiate the module
    init: function() {
      // retrieve GET parameters
      $('.reset-form').show();
      $('.show-on-success', $('.reset-form')).hide();
      handleResetPassword();
    }

  };

}();

jQuery(document).ready(function() {
  PasswordReset.init();
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
});
