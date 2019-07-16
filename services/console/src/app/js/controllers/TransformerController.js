/* Setup Transformer page controller */
angular.module('RTM').controller('TransformerController', ['$rootScope', '$scope', 'settings', function($rootScope, $scope, settings) {
  $scope.$on('$viewContentLoaded', function() {
    // initialize core components
    App.initAjax();

    // set default layout mode
    $rootScope.settings.layout.pageContentWhite = true;
    $rootScope.settings.layout.pageBodySolid = false;
    $rootScope.settings.layout.pageSidebarClosed = false;

    Thinx.init($rootScope, $scope);

    Thinx.deviceList()
    .done(function(data) {
      $scope.$emit("updateDevices", data);
    })
    .fail(error => $scope.$emit("xhrFailed", error));

    $scope.searchText = '';
    $scope.resetModal();

    $("#pageModal").on('shown.bs.modal', function(){
      console.log("Refreshing codemirror...");
      $scope.codeEditor.refresh();
      angular.element('input[name=transformerAlias]').focus();
    });

  });

  $scope.transformerForm = {
    utid: null,
    alias: null,
    body: null,
    changed: false
  };

  $scope.editorOpts = {
    lineWrapping : false,
    lineNumbers: true,
    mode: 'javascript',
    theme: 'material',
    autoRefresh: true
  };

  $scope.codemirrorLoaded = function(_editor){
    $scope.codeEditor = _editor;
    //_editor.focus();
    // Events
    // _editor.on("beforeChange", function(){ ... });
    // _editor.on("change", function(){ ... });
  };

  $scope.updateTransformer = function(utid) {
    // check for transformer with same utid
    if (!$rootScope.getTransformerByUtid($scope.transformerForm.utid)) {
      console.log('-- creating transformer ' + utid + '--');
      $rootScope.profile.info.transformers.push({
        'utid': $scope.transformerForm.utid,
        'alias': $scope.transformerForm.alias,
        'body': base64converter('decode', $rootScope.thinx.defaults.defaultTransformerBodyBase64)
      });
    } else {
      console.log('-- updating transformer ' + utid + '--');
      $rootScope.getTransformerByUtid(utid).body = base64converter('encode', $scope.transformerForm.body);
      $rootScope.getTransformerByUtid(utid).alias = $scope.transformerForm.alias;
    };

    $scope.$emit("saveProfileChanges", ["transformers"])
    $('#pageModal').modal('hide');

  };

  function revokeTransformers(utids) {
    console.log('--deleting transformers ' + utids.length +'--')
    // not implemented - transformers shouldn't be bulk removed
  }

  $scope.revokeTransformers = function() {
    // not implemented - transformers shouldn't be bulk removed
    console.log('-- processing selected items --');
    console.log($scope.selectedItems);

    var selectedToRevoke = $scope.selectedItems.slice();
    if (selectedToRevoke.length > 0) {
      revokeTransformers(selectedToRevoke);
    } else {
      toastr.warning('Nothing selected.', '<ENV::loginPageTitle>', {timeOut: 1000})
    }
  };


  $scope.removeTransformer = function(utid) {
    // remove from meta
    console.log("meta transformer to delete", $rootScope.meta.transformers[utid]);
    delete($rootScope.meta.transformers[utid])

    // remove from profile
    for (var index in $rootScope.profile.info.transformers) {
      if ($rootScope.profile.info.transformers[index].utid == utid) {
        console.log("profile transformer to delete", $rootScope.profile.info.transformers[index]);
        $rootScope.profile.info.transformers.splice(index,1);
      }
    }
    $scope.$emit("saveProfileChanges", ["transformers"]);
  };


  $scope.checkItem = function(utid) {
    console.log('### toggle item in selectedItems');
    var index = $scope.selectedItems.indexOf(utid);
    if (index > -1) {
      console.log('splicing on ', index, ' value ', $scope.selectedItems[index]);
      $scope.selectedItems.splice(index, 1);
    } else {
      $scope.selectedItems.push(utid);
    }
  }

  $scope.resetModal = function(utid) {
    if (typeof(utid) == "undefined") {
      $scope.transformerForm.utid = generateUtid();
      $scope.transformerForm.alias = null;
      $scope.transformerForm.body = null;
    } else {
      $scope.transformerForm.utid = utid;
      $scope.transformerForm.alias = $rootScope.getRawTransformerByUtid(utid).alias;
      $scope.transformerForm.body = $rootScope.getRawTransformerByUtid(utid).body;
    }
    $scope.transformerForm.changed = false;
    $scope.selectedItems = [];
  }

  function generateUtid() {
      if (typeof($rootScope.profile.info.transformers) !== 'undefined') {
        return String(CryptoJS.SHA256($rootScope.profile.owner+new Date().getTime()));
      }
      return String(0);
  }

}]);
