

sonar-scanner \
  -Dsonar.projectKey=suculent_thinx-device-api \
  -Dsonar.organization=suculent-github \
  -Dsonar.sources=. \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.login=$SONARCLOUD_KEY_THX \
  -Dsonar.javascript.lcov.reportPaths=lcov.info
