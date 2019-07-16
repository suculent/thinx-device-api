// spec.js
var env = require('./environment.js');

var enviroName = "test-enviro-name";
var enviroValue = "test-enviro-value";

describe('basic ui tests', function() {
  it('should navigate to enviros and open new enviro modal', function() {

    // open page
    //browser.waitForAngularEnabled(false);
    //browser.get(env.baseUrl + '/app/');
    //browser.waitForAngularEnabled(true);

    browser.driver.manage().window().maximize();

    // navigate to apikey view
    element(by.css('[name="settings-sub"]')).click();
    browser.sleep(1000);
    element(by.css('[ui-sref="enviro"]')).click();
    browser.sleep(1000);
    // open modal
    element(by.css('[ng-click="resetModal()"]')).click();

    browser.sleep(1000);
    browser.waitForAngular();
  });

  it('fill new enviro values, wait for confirmation and close modal', function() {
    // fill input
    element(by.css('[name="enviroName"]')).sendKeys(enviroName);
    element(by.css('[name="enviroValue"]')).sendKeys(enviroValue);

    // create api key
    element(by.buttonText("Submit")).click();

    // wait for modal close
    browser.sleep(4000);
    browser.waitForAngular();
  });

  it('should find new enviro on page', function() {
    var enviros = element.all(by.css('.row-item-title')).map(function (elm) {
      return elm.getText();
    });

    enviros.then(function (result) {
      expect(result).toContain(enviroName);
    });
  });

  it('should remove new source', function() {

    var checkitems = element.all(by.css('[ng-click*=checkItem]'));

    checkitems.then(function (results) {
      console.log("rows found: ", results.length);
      for (var i in results) {
        var resultAlias = results[i].element(by.css('.row-item-title'));
        resultAlias.getText().then(function (text) {
          if (text == enviroName) {
            console.log("selecting element for removal: ", text);
            results[i].click();
            browser.sleep(1000);
            browser.executeScript('window.scrollTo(0,0);').then(function() {
              element(By.css("a[class='quick-nav-trigger']")).click();
              element(by.css('[ng-click*=revokeEnviros]')).click();
              browser.sleep(1000);
            });
          }
        });
      }
    });

  });
});
