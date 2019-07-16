// spec.js
var env = require('./environment.js');

var googleTestEmail = 'enter-test-email';
var googleTestPassword = 'enter-test-password';

var githubTestEmail = 'enter-test-email';
var githubTestPassword = 'enter-test-password';

describe('pages with login', function() {

  it('should check if logged in, than log out and try invalid login', function() {
    expect(element(by.css('div.page-footer-inner')).getText()).toEqual('2018 © THiNX');
    browser.waitForAngularEnabled(false);
    browser.get(env.baseUrl);
    browser.sleep(1000);
    browser.driver.findElement(by.css('.login-form button[type="submit"]')).click();
    browser.sleep(1000);
    expect(element(By.css("#login-error")).getText()).toContain("Enter your credentials");
    browser.driver.findElement(by.name('username')).sendKeys('a');
    browser.driver.findElement(by.name('password')).sendKeys('b');
    browser.driver.findElement(by.css('.login-form button[type="submit"]')).click();
    browser.sleep(1000);
    expect(element(By.css("#login-error")).getText()).toContain("Username or password does not match");
  });

  it('should log in with Google', function() {
    browser.waitForAngularEnabled(false);
    browser.get('https://thinx.cloud:7443/oauth/google');
    browser.waitForAngularEnabled(true);
    browser.driver.sleep(1500);
    browser.driver.findElement(by.css('input[type="email"]')).sendKeys(googleTestEmail);
    browser.driver.findElement(by.css('#identifierNext')).click();
    browser.driver.sleep(1500);
    browser.driver.findElement(by.css('input[type="password"]')).sendKeys(googleTestPassword);
    browser.driver.findElement(by.css('#passwordNext')).click();
    browser.driver.sleep(5000);
    expect(element(by.css('div.page-footer-inner')).getText()).toEqual('2018 © THiNX');
  });

  it('should log in with Github', function() {
    browser.waitForAngularEnabled(false);
    browser.get('https://thinx.cloud:7443/oauth/github');
    browser.waitForAngularEnabled(true);
    browser.driver.sleep(1500);
    browser.driver.findElement(by.css('#login_field')).sendKeys(githubTestEmail);
    browser.driver.findElement(by.css('#password')).sendKeys(githubTestPassword);
    browser.driver.findElement(by.css('input[type="submit"]')).click();
    browser.driver.sleep(5000);
    expect(element(by.css('div.page-footer-inner')).getText()).toEqual('2018 © THiNX');
  });

});
