// spec.js
var env = require('./environment.js');

var sourceUrl = "git@github.com:suculent/thinx-firmware-esp8266.git";
var sourceAlias = "test-source-alias";

describe('basic ui tests', function() {
  it('should navigate to sources and open new source modal', function() {

    // open page
    //browser.waitForAngularEnabled(false);
    //browser.get(env.baseUrl + '/app/');
    //browser.waitForAngularEnabled(true);

    browser.driver.manage().window().maximize();

    // navigate to apikey view
    element(by.css('[name="settings-sub"]')).click();
    browser.sleep(1000);
    element(by.css('[ui-sref="source"]')).click();
    browser.sleep(1000);
    // open modal
    element(by.css('[ng-click="resetModal()"]')).click();

    browser.sleep(1000);
    browser.waitForAngular();
  });

  it('fill new source values, wait for confirmation and close modal', function() {
    // fill input
    element(by.css('[name="sourceAlias"]')).sendKeys(sourceAlias);
    element(by.css('[name="sourceUrl"]')).sendKeys(sourceUrl);

    // create api key
    element(by.buttonText("Submit")).click();

    // wait for modal close
    browser.waitForAngular();
    browser.sleep(5000);

  });

  it('should find new source on page', function() {
    // find apikey
    var sources = element.all(by.css('.row-item-title')).map(function (elm) {
      return elm.getText();
    });

    sources.then(function (result) {
      expect(result).toContain(sourceAlias);
    });
  });

  it('should remove new source', function() {

    var checkitems = element.all(by.css('[ng-click*=checkItem]'));

    checkitems.then(function (results) {
      console.log("rows found: ", results.length);
      for (var i in results) {
        var resultAlias = results[i].element(by.css('.row-item-title'));
        resultAlias.getText().then(function (text) {
          if (text == sourceAlias) {
            console.log("selecting element for removal: ", text);
            results[i].click();
            browser.sleep(1000);
            browser.executeScript('window.scrollTo(0,0);').then(function() {
              element(By.css("a[class='quick-nav-trigger']")).click();
              element(by.css('[ng-click*=revokeSources]')).click();
              browser.sleep(1000);
            });
          }
        });
      }
    });

  });
});
