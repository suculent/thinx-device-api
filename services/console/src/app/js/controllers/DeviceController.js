angular.module( "RTM" ).controller( "DeviceController", [ "$rootScope", "$scope", "$stateParams", "$templateCache", function( $rootScope, $scope, $stateParams, $templateCache ) {
  $scope.$on( "$viewContentLoaded", function() {
    // initialize core components
    App.initAjax();

    Thinx.deviceList()
    .done( function( data ) {
      $scope.$emit( "updateDevices", data );
      $scope.initDeviceForm();
    } )
    .fail( error => $scope.$emit( "xhrFailed", error ) );

    Thinx.sourceList()
    .done( function( data ) {
      console.log( "+++ updateSources " );
      $scope.$emit( "updateSources", data );
    } )
    .fail( error => $scope.$emit( "xhrFailed", error ) );

    Thinx.apikeyList()
    .done( function( data ) {
      console.log( "+++ updateApikeys " );
      $scope.$emit( "updateApikeys", data );
    } )
    .fail( error => $scope.$emit( "xhrFailed", error ) );

    Thinx.channelList()
    .done( function( data ) {
      console.log( "+++ updateChannels " );
      $scope.$emit( "updateChannels", data );
    } )
    .fail( error => $scope.$emit( "xhrFailed", error ) );

    $scope.attachingSource = false;
    $scope.attachingChannel = false;
  } );

  // end of onload function

  // set sidebar closed and body solid layout mode
  $rootScope.settings.layout.pageContentWhite = true;
  $rootScope.settings.layout.pageBodySolid = false;
  $rootScope.settings.layout.pageSidebarClosed = false;

  $scope.deviceForm = {};
  $scope.deviceForm.udid = null;
  $scope.deviceForm.alias = null;
  $scope.deviceForm.platform = "unknown";
  $scope.deviceForm.keyhash = null;
  $scope.deviceForm.source = null;
  $scope.deviceForm.mesh_ids = [];
  $scope.deviceForm.auto_update = null;
  $scope.deviceForm.description = null;
  $scope.deviceForm.category = null;
  $scope.deviceForm.tags = [];
  $scope.deviceForm.icon = "01";
  $scope.deviceForm.transformersVisible = [];
  $scope.deviceForm.buildHistoryVisible = false;
  $scope.deviceForm.buildHistoryLimit = 16;
  $scope.deviceForm.timezone_abbr = "UTC";
  $scope.deviceForm.timezone_offset = 0;
  $scope.deviceForm.timezone_utc = "Etc/GMT";
  $scope.deviceForm.environment = null;

  $scope.buildrunning = false;

  $scope.showIcons = false;

  $scope.editorOpts = {
    lineWrapping: false,
    lineNumbers: true,
    mode: "javascript",
    theme: "material"
  };

  // init timezone selector
  $scope.timezones = getTimezones(); // see main.js includes
  $scope.timezonesByUtc = timezonesByUtc();
  $scope.devicetime = getUTCWithOffset();

  $scope.parseTimezoneText = function( timezoneText ) {
    // TODO DONT
  //  return timezoneText.match(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/);
  };

  function timezonesByUtc() {
    var timezones_by_utc = [];
    for ( var timezone_key in $scope.timezones ) {
      for ( var utc_key in $scope.timezones[ timezone_key ].utc ) {
        timezones_by_utc[ $scope.timezones[ timezone_key ].utc[ utc_key ] ] = {
          "abbr": $scope.timezones[ timezone_key ].abbr,
          "offset": $scope.timezones[ timezone_key ].offset,
          "text": $scope.timezones[ timezone_key ].text,
          "name": $scope.timezones[ timezone_key ].value
        };
      }
    }

    console.log( "Timezones by UTC:", timezones_by_utc );
    return timezones_by_utc;
  }


  function getUTCWithOffset() {
    var new_utc = new Date().getTime();
    var utc_with_offset = new Date( ( new_utc * 1 ) - ( ( $scope.deviceForm.timezone_offset * 60 ) * 60 * 1000 ) );
    console.log( new_utc + "<br>" );
    console.log( utc_with_offset + "<br>" );
    return utc_with_offset;
  }

  var formBeforeEdit = JSON.parse( JSON.stringify( $scope.deviceForm ) );

  Thinx.init( $rootScope, $scope );

  $scope.attachSource = function( sourceId, deviceUdid ) {
    console.log( "-- attaching " + sourceId + " to  " + deviceUdid + "--" );
    $scope.attachingSource = true;

    Thinx.attachSource( sourceId, deviceUdid )
    .done( function( response ) {
      if ( typeof( response ) !== "undefined" ) {
        if ( response.success ) {
          console.log( "-- attach success --" );
          console.log( response );

          // update local data to avoid full update
          $rootScope.getDeviceByUdid( deviceUdid ).source = response.attached;
          $scope.attachingSource = false;
          $scope.$apply();

          toastr.success( "Repository Attached.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
        } else {
          console.log( response );
          toastr.error( "Attach Failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
        }
      } else {
        console.log( "error" );
        console.log( response );
      }
    } )
    .fail( function( error ) {
      console.error( "Error:", error );
      toastr.error( "Attach Failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
    } );

  };

  $scope.detachSource = function( deviceUdid ) {
    console.log( "-- detaching source from " + deviceUdid + "--" );
    Thinx.detachSource( deviceUdid )
    .done( function( response ) {
      if ( typeof( response ) !== "undefined" ) {
        if ( response.success ) {
          console.log( response );
          for ( var index in $rootScope.devices ) {
            if ( $rootScope.devices[ index ].udid == deviceUdid ) {
              $rootScope.devices[ index ].source = undefined;
            }
          }
          toastr.success( "Repository Detached.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
          $scope.deviceForm.source = null;
          $scope.$apply();
        } else {
          console.log( response );
          toastr.error( "Detach Failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
        }
      } else {
        console.log( "error" );
        console.log( response );
      }
    } )
    .fail( function( error ) {
      console.error( "Error:", error );
      toastr.error( "Detach Failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
    } );
  };

  $scope.submitTimezone = function( timezone_abbr, timezone_offset, timezone_utc ) {
    // set new timezone abbr from selector
    $scope.deviceForm.timezone_abbr = timezone_abbr;
    $scope.deviceForm.timezone_offset = timezone_offset;
    $scope.deviceForm.timezone_utc = timezone_utc;

    // uúpdate device timezone offset and abbr
    $scope.submitDeviceFormChange( "timezone_offset" );
  };

  $scope.submitDeviceFormChange = function( prop ) {

    console.log( "-- changing device: " + $scope.deviceForm.udid + " (" + $scope.deviceForm.alias + ") --" );

    var updatedProps = { udid: $scope.deviceForm.udid };
    updatedProps[ prop ] = $scope.deviceForm[ prop ];

    // if transformers was changed, use real device transformers instead of unsaved form data
    if ( prop == "transformers" ) {
      updatedProps[ "transformers" ] = $rootScope.getDeviceByUdid( $scope.deviceForm.udid ).transformers;
    }

    // if timezone was changed, add timezone_abbr to posted changes
    if ( prop == "timezone_offset" ) {
      updatedProps[ "timezone_abbr" ] = $scope.deviceForm.timezone_abbr;
      updatedProps[ "timezone_utc" ] = $scope.deviceForm.timezone_utc;
    }

    Thinx.submitDevice( updatedProps )
    .done( function( response ) {

      if ( typeof( response ) !== "undefined" ) {
        if ( typeof( response.success ) !== "undefined" && response.success ) {
          console.log( response );
          toastr.success( "Device settings updated.", "<ENV::loginPageTitle>", { timeOut: 5000 } );

          console.log( "-- refreshing devices --" );

          Thinx.deviceList()
          .done( function( data ) {
            $scope.$emit( "updateDevices", data );
            $scope.initDeviceForm();
          } )
          .fail( function( error ) {
            console.log( "Error:", error );
          } );

        } else {
          console.log( response );
          toastr.error( "Device settings updated failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
        }
      } else {
        console.log( "error:" );
        console.log( response );
      }

    } )
    .fail( function( error ) {
      console.error( "Error:", error );
      toastr.error( "Device settings update failed badly.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
    } );
  };

  $scope.submitChannelChange = function() {
    console.log( "- NOT IMPLEMENTED - will be used for detaching" );
  };

  $scope.channelSelected = function( channel ) {
    console.log( "-- selecting channel --", channel );
    if ( typeof( channel.value.mesh_id ) !== "undefined" ) {
      // attach channel to device
      $scope.attachChannel( channel.value.mesh_id, $scope.deviceForm.udid );
    } else {
      console.log( "- NOT IMPLEMENTED -", channel.value.mesh_id );
    }
  };

  $scope.channelTransform = function( channelAlias ) {
    console.log( "channel alias search:", channelAlias );
    return {
      value: {
        mesh_id: generateUtid(),
        alias: channelAlias,
        owner_id: $rootScope.profile.owner_id
      }
    };
  };

  $scope.attachChannel = function( meshId, deviceUdid ) {
    console.log( "-- attaching " + meshId + " to  " + deviceUdid + "--" );
    $scope.attachingChannel = true;
    Thinx.attachChannel( meshId, deviceUdid )
      .done( function( response ) {
        if ( typeof( response ) !== "undefined" && response.success ) {
            console.log( "-- attach success --" );
            // update local data to avoid full update
            $rootScope.getDeviceByUdid( deviceUdid ).mesh_ids = response.mesh_ids;
            $scope.attachingChannel = false;
            $scope.$apply();
            toastr.success( "Channel Attached.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
        } else {
          console.log( "error", response );
          toastr.error( "Channel Attach Failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
        }
      } )
      .fail( function( error ) {
        console.error( "Error:", error );
        toastr.error( "Channel Attach Failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
      } );
  };

  $scope.detachChannel = function( channel ) {
    let deviceUdid = $scope.deviceForm.udid;
    console.log( "-- detaching channel " + channel.alias + " from " + deviceUdid + "--" );
    Thinx.detachChannel( channel.mesh_id, deviceUdid )
      .done( function( response ) {
        if ( typeof( response ) !== "undefined" && response.success ) {
          $rootScope.getDeviceByUdid( deviceUdid ).mesh_ids = response.mesh_ids;
          toastr.success( "Channel Detached.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
          $scope.deviceForm.mesh_ids = response.mesh_ids;
          $scope.$apply();
        } else {
          console.log( "response error", response );
          toastr.error( "Channel Detach Failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
        }
      } )
      .fail( function( error ) {
        console.error( "Error:", error );
        toastr.error( "Channel Detach Failed.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
      } );
  };

  $scope.updateTransformer = function( utid ) {
    if ( $rootScope.getRawTransformerByUtid( utid ).changed == true ) {
      console.log( "-- updating transformer body " + utid + "--" );
      // eslint-disable-next-line  no-undef
      $rootScope.getTransformerByUtid( utid ).body = base64converter( "encode", $rootScope.getRawTransformerByUtid( utid ).body );
      $rootScope.getTransformerByUtid( utid ).alias = $rootScope.getRawTransformerByUtid( utid ).alias;
      $rootScope.getRawTransformerByUtid( utid ).changed = false;
      $scope.$emit( "saveProfileChanges", [ "transformers" ] );
    }
  };

  $scope.removeTransformer = function( utid ) {
    console.log( "-- removing transformer " + utid + "--" );

    // remove from device
    for ( var index in $scope.deviceForm.transformers ) {
      if ( $scope.deviceForm.transformers[ index ] == utid ) {
        console.log( "device transformer to delete", $scope.deviceForm.transformers[ index ] );
        $scope.deviceForm.transformers.splice( index, 1 );
      }
    }
    console.log( "device", $scope.deviceForm.transformers );
    $scope.submitDeviceFormChange( "transformers" );

    // remove from meta
    console.log( "meta transformer to delete", $rootScope.meta.transformers[ utid ] );
    delete( $rootScope.meta.transformers[ utid ] );
    console.log( "meta", $rootScope.meta.transformers );
    // $scope.$emit("updateRawTransformers", $rootScope.profile.info.transformers);

    // remove from profile
    for ( var t in $rootScope.profile.info.transformers ) {
      if ( $rootScope.profile.info.transformers[ t ].utid == utid ) {
        console.log( "profile transformer to delete", $rootScope.profile.info.transformers[ t ] );
        $rootScope.profile.info.transformers.splice( t, 1 );
      }
    }
    $scope.$emit( "saveProfileChanges", [ "transformers" ] );
    console.log( "profile", $rootScope.profile.info.transformers );
  };

  $scope.transformerSelected = function( transformer ) {
    console.log( "-- new transformer --", transformer );

    if ( typeof( transformer.value.utid ) !== "undefined" ) {
      // if transformer dowsnt exist yet, create it
      if ( !$rootScope.getTransformerByUtid( transformer.value.utid ) ) {
        $rootScope.profile.info.transformers.push( {
          "utid": transformer.value.utid,
          "alias": transformer.value.alias,
          // eslint-disable-next-line  no-undef
          "body": base64converter( "encode", transformer.value.body )
        } );
        $scope.toggleTransformer( transformer.value.utid );
        $scope.$emit( "saveProfileChanges", [ "transformers" ] );
      } else {
        console.log( typeof( $rootScope.getTransformerByUtid( transformer.value.utid ) ) );
      }
    }
  };


  function generateUtid() {
    if ( typeof( $scope.deviceForm.transformers ) !== "undefined" ) {
      return String( CryptoJS.SHA256( $rootScope.profile.owner + new Date().getTime() ) );
    }
    return String( 0 );
  }

  $scope.tagTransform = function( transformerAlias ) {
    console.log( "transformer alias search:", transformerAlias );
    return {
      value: {
        utid: generateUtid(),
        alias: transformerAlias,
        // eslint-disable-next-line  no-undef
        body: base64converter( "decode", $rootScope.thinx.defaults.defaultTransformerBodyBase64 ),
        changed: false
      }
    };
  };

  $scope.toggleTransformer = function( utid ) {
    console.log( "### toggle transformer visibility" );
    var index = $scope.deviceForm.transformersVisible.indexOf( utid );
    if ( index > -1 ) {
      console.log( "splicing on ", index, " value ", $scope.deviceForm.transformersVisible[ index ] );
      $scope.deviceForm.transformersVisible.splice( index, 1 );
    } else {
      $scope.deviceForm.transformersVisible.push( utid );
    }
  };

  $scope.build = function( deviceUdid, sourceId ) {
    console.log( "-- building firmware for " + deviceUdid + "/" + $rootScope.getSourceById( sourceId ).alias + " --" );

    if ( typeof( $rootScope.meta.deviceBuilds[ deviceUdid ] ) === "undefined" ) {
      $rootScope.meta.deviceBuilds[ deviceUdid ] = [];
    }

    $scope.buildrunning = true;

    Thinx.build( deviceUdid, sourceId )
    .done( function( response ) {

      let nowTime = new Date().getTime();

      if ( typeof( response ) !== "undefined" ) {
        if ( response.success ) {

          let buildRecord = {
            build_id: response.build_id,
            last_update: nowTime,
            start_time: nowTime,
            state: response.status,
            timestamp: nowTime
          };

          // prepare user metadata for particular device
          $rootScope.meta.deviceBuilds[ deviceUdid ].push( buildRecord );

          // update build history
          Thinx.getBuildHistory()
          .done( function( data ) {
            $scope.$emit( "updateBuildHistory", data );
          } )
          .fail( error => $scope.$emit( "xhrFailed", error ) );

          // save user-spcific goal achievement
          if ( $rootScope.profile.info.goals.length > 0 ) {
            if ( !$rootScope.profile.info.goals.includes( "build" ) ) {
              $rootScope.profile.info.goals.push( "build" );
              $scope.$emit( "saveProfileChanges", [ "goals" ] );
            }
          }

          // show notification to open log view
          toastr.info(
            "Build created<br><br>Click to show log...",
            "THiNX Builder",
            {
              timeOut: 15000,
              extendedTimeOut: 60000,
              tapToDismiss: true,
              closeButton: true,
              progressBar: true,
              onclick: function() {
                $scope.$emit( "showLogOverlay", response.build_id );
              }
            }
          );

          $scope.$apply();
        } else {
          toastr.error( response.status, "<ENV::loginPageTitle>", { timeOut: 5000 } );
        }
      } else {
        toastr.error( "Build Failed", "<ENV::loginPageTitle>", { timeOut: 5000 } );
      }

    } )
    .fail( function( error ) {
      console.error( "Error:", error );
      toastr.error( "Build Failed Badly.", "<ENV::loginPageTitle>", { timeOut: 5000 } );
    } );
  };

  $scope.showDeviceLastBuild = function( deviceUdid, event ) {
    event.stopPropagation();
    console.log( "--- trying to show last build log for " + deviceUdid );
    $rootScope.modalBuildId = $rootScope.meta.deviceBuilds[ deviceUdid ][ 0 ].build_id;
    $rootScope.showLog( $rootScope.modalBuildId );
  };

  $scope.downloadArtifacts = function( deviceUdid, build_id ) {
    console.log( "--- trying to download artifacts for build id: " + build_id );
    Thinx.getArtifacts( deviceUdid, build_id )
    .then( blob => {
      console.log( blob, typeof blob );
      // eslint-disable-next-line  no-undef
      saveBlob( blob, build_id + ".zip" );
    } )
    .catch( error => {
      toastr.error( error, "<ENV::loginPageTitle>", { timeOut: 5000 } );
    } );
  };

  $scope.hasBuildId = function( deviceUdid ) {
    if ( typeof( $rootScope.meta.deviceBuilds[ deviceUdid ] ) !== "undefined" ) {
      if ( $rootScope.meta.deviceBuilds[ deviceUdid ].length == 0 ) {
        return null;
      } else {
        return true;
      }
    }
    return false;
  };

  $scope.hasSource = function( device ) {
    if ( typeof( device.source ) !== "undefined" && device.source !== null ) {
      return true;
    }
    return false;
  };

  $scope.goBack = function() {
    window.history.back();
  };

  $scope.initDeviceForm = function() {
    var device = {};
    if ( !$stateParams.udid ) {
      // TODO udid not set, return to dashboard
    } else {
      for ( var index in $rootScope.devices ) {
        if ( $rootScope.devices[ index ].udid == $stateParams.udid ) {
          device = $rootScope.devices[ index ];
          console.log( "edited device", device );
        }
      }
    }

    console.log( "Initializing form values..." );
    // $scope.deviceForm.index = index;
    $scope.deviceForm.udid = device.udid;
    $scope.deviceForm.alias = device.alias;
    $scope.deviceForm.description = device.description;

    if ( typeof( device.base_platform ) !== "undefined" ) {
      $scope.deviceForm.platform = device.platform;
      $scope.deviceForm.base_platform = device.platform.split( ":" )[ 0 ];
    } else {
      $scope.deviceForm.platform = "unknown";
      $scope.deviceForm.base_platform = "unknown";
    }

    if ( typeof( device.keyhash ) !== "undefined" ) {
      $scope.deviceForm.keyhash = device.keyhash;
    } else {
      $scope.deviceForm.keyhash = null;
    }

    if ( typeof( device.source ) !== "undefined" ) {
      $scope.deviceForm.source = device.source;
    } else {
      $scope.deviceForm.source = null;
    }

    if ( typeof( device.mesh_ids ) !== "undefined" ) {
      $scope.deviceForm.mesh_ids = device.mesh_ids;
    } else {
      $scope.deviceForm.mesh_ids = [];
    }

    if ( typeof( device.auto_update ) !== "undefined" ) {
      $scope.deviceForm.auto_update = device.auto_update;
    } else {
      $scope.deviceForm.auto_update = false;
    }

    if ( typeof( device.category ) !== "undefined" ) {
      $scope.deviceForm.category = device.category;
    } else {
      $scope.deviceForm.category = null;
    }

    if ( typeof( device.tags ) !== "undefined" ) {
      $scope.deviceForm.tags = device.tags;
    } else {
      $scope.deviceForm.tags = [];
    }

    if ( typeof( device.transformers ) !== "undefined" ) {
      $scope.deviceForm.transformers = device.transformers;
    } else {
      $scope.deviceForm.transformers = [];
    }

    if ( typeof( device.timezone_offset ) !== "undefined" ) {
      $scope.deviceForm.timezone_abbr = device.timezone_abbr;
      $scope.deviceForm.timezone_offset = device.timezone_offset;
    } else {
      $scope.deviceForm.timezone_abbr = $rootScope.profile.info.timezone_abbr;
      $scope.deviceForm.timezone_offset = $rootScope.profile.info.timezone_offset;
    }
    $scope.devicetime = getUTCWithOffset();

    if ( typeof( device.icon ) !== "undefined" ) {
      $scope.deviceForm.icon = device.icon;
    } else {
      $scope.deviceForm.icon = "01";
    }

    $scope.showIcons = false;

    if ( typeof( device.environment ) !== "undefined" ) {
      $scope.deviceForm.environment = device.environment;
    } else {
      $scope.deviceForm.environment = null;
    }

    /* save start values to compare with changes */
    formBeforeEdit = JSON.parse( JSON.stringify( $scope.deviceForm ) );
    console.log( "form vars", $scope.deviceForm );

    // refresh view
    $scope.$apply();

    // refresh latest firmware envelope
    Thinx.getLatestFirmwareEnvelope( $scope.deviceForm.udid )
    .done( function( data ) {
      console.log( "+++ updateLatestFirmwareEnvelope " );
      $scope.$emit( "updateLatestFirmwareEnvelope", data );
    } )
    .fail( error => $scope.$emit( "xhrFailed", error ) );

  };

  $scope.toggleIconset = function() {
    if ( $scope.showIcons == false ) {
      $scope.showIcons = true;
    } else {
      $scope.showIcons = false;
    }
  };

  $scope.submitIcon = function( icon ) {
    $scope.deviceForm.icon = icon;
    $scope.submitDeviceFormChange( "icon" );
    $scope.showIcons = false;
  };

  $templateCache.put( "bootstrap/match-multiple.tpl.html",
  "<span class=\"ui-select-match transformer-input-block\">" +
    "<span ng-repeat=\"$item in $select.selected track by $index\">" +
      "<span ng-if=\"$select.parserResult.itemName === 'transformer'\" " +
        "ng-click=\"showEditorOverlay($item.value.utid);\"" +
        "class=\"ui-select-match-item transformer-editor-btn btn btn-default btn-sm\" " +
        "tabindex=\"-1\" " +
        "type=\"button\" " +
        "ng-disabled=\"$select.disabled\" " +
        "ng-class=\"{'btn-primary':$selectMultiple.activeMatchIndex === $index, 'select-locked':$select.isLocked(this, $index)}\" " +
        "ui-select-sort=\"$select.selected\">" +
        "<i class=\"fa fa-pencil\"></i>" +
      "</span>" +

      "<span ng-if=\"$select.parserResult.itemName === 'transformer'\" " +
        "ng-click=\"toggleTransformer($item.value.utid)\"" +
        "class=\"ui-select-match-item btn btn-default btn-sm\" " +
        "tabindex=\"-1\" " +
        "type=\"button\" " +
        "ng-disabled=\"$select.disabled\" " +
        "ng-class=\"{'btn-primary':$selectMultiple.activeMatchIndex === $index, 'select-locked':$select.isLocked(this, $index)}\" " +
        "ui-select-sort=\"$select.selected\">" +
          "<span class=\"close ui-select-match-close\" ng-hide=\"$select.disabled\" ng-click=\"$selectMultiple.removeChoice($index)\">&nbsp;&times;</span>" +
          "<i ng-if=\"$item.value !== undefined\" ng-class=\"{'fa fa-eye-slash':deviceForm.transformersVisible.indexOf($item.value.utid) == -1, 'fa fa-eye': deviceForm.transformersVisible.indexOf($item.value.utid) > -1}\"></i>" +
          "<span uis-transclude-append></span>" +
      "</span>" +

      "<span ng-if=\"$select.parserResult.itemName !== 'transformer'\" " +
        "class=\"ui-select-match-item btn btn-default btn-sm\" " +
        "tabindex=\"-1\" " +
        "type=\"button\" " +
        "ng-disabled=\"$select.disabled\" " +
        "ng-class=\"{'btn-primary':$selectMultiple.activeMatchIndex === $index, 'select-locked':$select.isLocked(this, $index)}\" " +
        "ui-select-sort=\"$select.selected\">" +
          // 'ng-click="this.clickTag($index)" ' + // default value
          "<span ng-if=\"$select.parserResult.itemName == 'channel'\" class=\"close ui-select-match-close\" ng-hide=\"$select.disabled\" ng-click=\"detachChannel($item.value);\">&nbsp;&times;</span>" +
          "<span ng-if=\"$select.parserResult.itemName == 'tag'\" class=\"close ui-select-match-close\" ng-hide=\"$select.disabled\" ng-click=\"$selectMultiple.removeChoice($index)\">&nbsp;&times;</span>" +
          "<span uis-transclude-append></span>" +
      "</span>" +

    "</span>" +
  "</span>" );

} ] );
