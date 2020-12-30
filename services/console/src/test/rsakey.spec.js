// spec.js
var env = require('./environment.js');
// var newRsakey = null;
var rsakeyAlias = "test-rsakey-alias";
var rsakeyValue = "test-rsakey-value-1234567890";

// var newRsakeyFingerprint = null;

describe('basic ui tests', function() {
  it('should navigate to rsakeys and open new rsakey modal', function() {

    // open page
    //browser.waitForAngularEnabled(false);
    //browser.get(env.baseUrl + '/app/');
    //browser.waitForAngularEnabled(true);

    browser.driver.manage().window().maximize();

    // navigate to rsakey view
    element(by.css('[name="settings-sub"]')).click();
    browser.sleep(1000);
    element(by.css('[ui-sref="rsakey"]')).click();
    browser.sleep(1000);

    // open modal
    // element(by.buttonText("Create RSA Key")).click();
    element(by.css('[ng-click="resetModal()"]')).click();

    browser.sleep(2000);
    browser.waitForAngular();
  });

  it('fill new rsakey alias, submit (may also check modal close event on success)', function() {

    // fill input
    element(by.css('[name="rsakeyAlias"]')).sendKeys(rsakeyAlias);
    element(by.css('[name="rsakeyValue"]')).sendKeys(rsakeyValue);

    // create api key
    element(by.buttonText("Submit")).click();

    browser.sleep(4000);
    browser.waitForAngular();

    // TODO: expect(newrsakey).not.toBe(null);
    // element(by.buttonText("Close")).click();
  });

  it('should find new rsakey on page', function() {
    var rsakeys = element.all(by.css('.row-item-title')).map(function (elm) {
      console.log('*elm found*')
      return elm.getText();
    });

    rsakeys.then(function (result) {
      expect(result).toContain(rsakeyAlias);
    });
  });

  it('should select new rsakey row, then click on delete icon', function() {

    var checkitems = element.all(by.css('[ng-click*=checkItem]'));

    checkitems.then(function (results) {
      console.log("rows found: ", results.length);
      for (var i in results) {
        var title = results[i].element(by.css('.row-item-title'));
        title.getText().then(function (text) {
          if (text == rsakeyAlias) {
            console.log("selecting element for removal: ", text);
            results[i].click();
            browser.sleep(1000);
            browser.executeScript('window.scrollTo(0,0);').then(function() {
              element(By.css("a[class='quick-nav-trigger']")).click();
              element(by.css('a[ng-click*=revokeRsakeys]')).click();
              browser.sleep(1000);
            });
          }
        });
      }
    });

  });

});
