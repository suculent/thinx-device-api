angular.module('RTM').controller('UserProfileController', function($rootScope, $scope, $http, $timeout, $state) {
  $scope.$on('$viewContentLoaded', function() {
    App.initAjax(); // initialize core components
    Layout.setAngularJsSidebarMenuActiveLink('set', $('#sidebar_menu_link_profile'), $state); // set profile link active in sidebar menu

    $scope.newAvatar = null;
    $scope.searchText = "";

    $scope.deleteForm = {
      owner: null
    };

    $scope.messageForm = {
      text: null
    };

  });

  Thinx.init($rootScope, $scope);

  // set sidebar closed and body solid layout mode
  $rootScope.settings.layout.pageBodySolid = true;
  // $rootScope.settings.layout.pageSidebarClosed = true;

  // init timezone selector
  $scope.timezones = getTimezones();

  $scope.submitProfileFormChanges = function(changedProps) {
    console.log('-- submitting profile changes: ' + changedProps);

    Thinx.submitProfileChanges(changedProps, $rootScope.profile)
    .done(function(response) {

      if (typeof(response) !== "undefined") {
        if (typeof(response.success) !== "undefined" && response.success) {
          console.log(' == Profile update success ==');
          console.log(response);

          Thinx.getProfile().done(function(data) {
            $scope.$emit("updateProfile", data);
          })
          .fail(error => console.log('Error:', error));

          toastr.success('Profile updated.', '<ENV::loginPageTitle>', {timeOut: 5000});
        } else {
          console.log(response);
          toastr.error('Profile Update Failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
        }
      } else {
        console.log('error');
        console.log(response);
      }

    })
    .fail(function(error) {
      console.error('Error:', error);
      toastr.error('Profile Update Failed Badly.', '<ENV::loginPageTitle>', {timeOut: 5000});
    });
  };

  $scope.processAvatar = function() {

    var avatarMaxSize = 500000;
    console.log('-- processing user avatar --');
    console.log  ( $('#newAvatarInput').prop('files') );

    if ($('#newAvatarInput').prop('files').length > 0) {

      var reader = new FileReader();
      reader.onloadend = function(e) {
        console.log('-- file read --');
        console.log(e.total);

        if (e.total < avatarMaxSize) {
          $scope.newAvatar = e.target.result;
        } else {
          toastr.error('Avatar size over limit 500kB (' + e.total/1000 + ' kB).', '<ENV::loginPageTitle>', {timeOut: 5000});
        }
        $scope.$apply();
      }
      reader.readAsDataURL($('#newAvatarInput').prop('files')[0]);

    } else {
      // no file selected
      $scope.newAvatar = null;
    }
    $scope.$apply();
  };


  $scope.submitAvatarForm = function() {
    console.log('-- changing user avatar --');
    // console.log($scope.newAvatar);

    if ($scope.newAvatar == null) {
      console.log('no file selected');
      return;
    }

    Thinx.submitProfileAvatar($scope.newAvatar)
    .done(function(response) {

      if (typeof(response) !== "undefined") {
        if (typeof(response.success) !== "undefined" && response.success) {
          console.log(response);

          console.log('-- avatar success, refreshing profile --');

          Thinx.getProfile().done(function(data) {
            $scope.$emit("updateProfile", data);
          })
          .fail(error => console.log('Error:', error));

          toastr.success('Avatar updated.', '<ENV::loginPageTitle>', {timeOut: 5000});
        } else {
          console.log(response);
          toastr.error('Avatar Update Failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
        }
      } else {
        console.log('error');
        console.log(response);
      }
    })
    .fail(function(error) {
      console.error('Error:', error);
      toastr.error('Avatar Update Failed Badly.', '<ENV::loginPageTitle>', {timeOut: 5000});
    });

  }

  $scope.removeGoal = function(goalId) {
    console.log('-- current goals: ' + $rootScope.profile.info.goals);
    console.log('-- removing goal: ' + goalId);

    var index = $rootScope.profile.info.goals.indexOf(goalId);
    if (index > -1) {
      $rootScope.profile.info.goals.splice(index, 1);
    };
  };



  $scope.removeTag = function(tagId) {
    console.log('-- current tags: ' + $rootScope.profile.info.tags);
    console.log('-- removing tag: ' + tagId);

    var index = $rootScope.profile.info.tags.indexOf(tagId);
    if (index > -1) {
      $rootScope.profile.info.tags.splice(index, 1);
    };
  };

  $scope.downloadProfile = function() {

    var filename = "thx_profile.json";

    Thinx.profileDownload()
    .done(function(response) {
      if (typeof(response) !== "undefined") {
        if (typeof(response.success) !== "undefined" && response.success) {

          var blob = new Blob([JSON.stringify(response.user_data)], {type: 'text/json'});
          if (window.navigator && window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveOrOpenBlob(blob, filename);
           }
           else{
               var e = document.createEvent('MouseEvents'),
                   a = document.createElement('a');

               a.download = filename;
               a.href = window.URL.createObjectURL(blob);
               a.dataset.downloadurl = ['text/json', a.download, a.href].join(':');
               e.initEvent('click', true, false, window,
                   0, 0, 0, 0, 0, false, false, false, false, 0, null);
               a.dispatchEvent(e);
           }
        } else {
          console.log(response);
          toastr.error('Profile Download Failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
        }
      } else {
        console.log('error');
        console.log(response);
      }
    })
    .fail(function(error) {
      console.error('Error:', error);
      toastr.error('Profile Download Failed Badly.', '<ENV::loginPageTitle>', {timeOut: 5000});
    });
  };

  $scope.submitUserDelete = function() {

    var userToBeDeleted = {
      username: $rootScope.profile.username,
      owner: $rootScope.profile.owner
    };

    Thinx.userDelete(userToBeDeleted)
    .done(function(response) {

      if (typeof(response) !== "undefined") {
        if (typeof(response.success) !== "undefined" && response.success) {
          console.log(response);
          window.location = Thinx.baseUrl() + "/logout";
        } else {
          console.log(response);
          toastr.error('User Delete Failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
        }
      } else {
        console.log('error');
        console.log(response);
      }
    })
    .fail(function(error) {
      console.error('Error:', error);
      toastr.error('User Delete Failed Badly.', '<ENV::loginPageTitle>', {timeOut: 5000});
    });
  };

  $scope.checkDeleteForm = function() {
    if ($scope.deleteForm.owner == $rootScope.profile.owner) {
      return false;
    }
    return true;
  };

  $scope.submitSystemMessageForm = function() {

    Thinx.submitSystemMessage($scope.messageForm)
    .done(function(response) {

      if (typeof(response) !== "undefined") {
        if (typeof(response.success) !== "undefined" && response.success) {
          console.log(response);
          toastr.success('Message sent.', '<ENV::loginPageTitle>', {timeOut: 5000});
          $scope.messageForm.text = null;
        } else {
          console.log(response);
          toastr.error('Message Submit Failed.', '<ENV::loginPageTitle>', {timeOut: 5000});
        }
      } else {
        console.log('error');
        console.log(response);
      }
    })
    .fail(function(error) {
      console.error('Error:', error);
      toastr.error('Message Submit Failed Badly.', '<ENV::loginPageTitle>', {timeOut: 5000});
    });
  };

});
