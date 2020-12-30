// spec.js
var env = require('./environment.js');
var newApikey = null;
var newApiAlias = "test-key-alias";
var newApikeyFingerprint = null;

describe('basic ui tests', function() {
  it('should navigate to apikeys and open new apikey modal', function() {

    // open page
    //browser.waitForAngularEnabled(false);
    //browser.get(env.baseUrl + '/app/');
    //browser.waitForAngularEnabled(true);

    browser.driver.manage().window().maximize();

    // navigate to apikey view
    element(by.css('[name="settings-sub"]')).click();
    browser.sleep(1000);
    element(by.css('[ui-sref="apikey"]')).click();
    browser.sleep(1000);

    // open modal
    element(by.css('[ng-click="resetModal()"]')).click();

    browser.sleep(2000);
    browser.waitForAngular();
  });

  it('fill new apikey alias, submit, wait for confirmation and close modal', function() {
    // fill input
    element(by.css('[name="apikeyAlias"]')).sendKeys(newApiAlias);

    // create api key
    element(by.buttonText("Create")).click();
    browser.waitForAngular();

    // check new key and close dialog
    newApikey = element(by.css('[name="newApikey"]')).getAttribute('value');
    expect(newApikey).not.toBe(null);
    element(by.buttonText("Close")).click();

    // wait for modal close
    browser.sleep(2000);
    browser.waitForAngular();
  });

  it('should find new apikey on page', function() {
    var apikeys = element.all(by.css('.apikey-alias')).map(function (elm) {
      return elm.getText();
    });

    apikeys.then(function (result) {
      expect(result).toContain(newApiAlias);
    });
  });

  it('should remove new apikey', function() {

    var checkitems = element.all(by.css('[ng-click*=checkItem]'));

    checkitems.then(function (results) {
      console.log("rows found: ", results.length);
      for (var i in results) {
        var resultAlias = results[i].element(by.css('.apikey-alias'));
        resultAlias.getText().then(function (text) {
          if (text == newApiAlias) {
            console.log("selecting element for removal: ", text);
            results[i].click();
            browser.sleep(1000);
            browser.executeScript('window.scrollTo(0,0);').then(function() {
              element(By.css("a[class='quick-nav-trigger']")).click();
              element(by.css('[ng-click*=revokeApikeys]')).click();
              browser.sleep(1000);
            });
          }
        });
      }
    });

  });
});
