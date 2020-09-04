/***
GLobal Directives
***/

// Route State Load Spinner(used on page or content load)
RTM.directive('ngSpinnerBar', ['$rootScope', '$state',
function($rootScope, $state) {
  return {
    link: function(scope, element, attrs) {
      // by defult hide the spinner bar
      element.addClass('hide'); // hide spinner bar by default

      // display the spinner bar whenever the route changes(the content part started loading)
      $rootScope.$on('$stateChangeStart', function() {
        element.removeClass('hide'); // show spinner bar
      });

      // hide the spinner bar on rounte change success(after the content loaded)
      $rootScope.$on('$stateChangeSuccess', function(event) {
        element.addClass('hide'); // hide spinner bar
        $('body').removeClass('page-on-load'); // remove page loading indicator
        Layout.setAngularJsSidebarMenuActiveLink('match', null, event.currentScope.$state); // activate selected link in the sidebar menu

        // auto scroll to page top
        if ($rootScope.settings.layout.pageAutoScrollOnLoad > 0) {
          setTimeout(function () {
            App.scrollTop(); // scroll to the top on content load
          }, $rootScope.settings.layout.pageAutoScrollOnLoad);
        }

      });

      // handle errors
      $rootScope.$on('$stateNotFound', function() {
        element.addClass('hide'); // hide spinner bar
      });

      // handle errors
      $rootScope.$on('$stateChangeError', function() {
        element.addClass('hide'); // hide spinner bar
      });
    }
  };
}
])

// Handle global LINK click
RTM.directive('a', function() {
  return {
    restrict: 'E',
    link: function(scope, elem, attrs) {
      if (attrs.ngClick || attrs.href === '' || attrs.href === '#') {
        elem.on('click', function(e) {
          e.preventDefault(); // prevent link click for above criteria
        });
      }
    }
  };
});

// Handle Dropdown Hover Plugin Integration
RTM.directive('dropdownMenuHover', function () {
  return {
    link: function (scope, elem) {
      elem.dropdownHover();
    }
  };
});

// Handle ui-sref click events inside other clickable elements
RTM.directive('stopEvent', function () {
  return {
    restrict: 'A',
    link: function (scope, element, attr) {
      element.bind('click', function (e) {
        e.stopPropagation();
      });
    }
  };
});
