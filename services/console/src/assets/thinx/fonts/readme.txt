HOW TO use THiNX custom icon font with Hammer icon?

1. extract the hammer font files into /path-to-icon-font
===============================================

2. copy following code into your CSS file:
==========================================

@font-face {
  font-family: 'icomoon';
  src:  url('/path-to-icon-font/icomoon.eot?fb26dz');
  src:  url('/path-to-icon-font/icomoon.eot?fb26dz#iefix') format('embedded-opentype'),
    url('/path-to-icon-font/icomoon.ttf?fb26dz') format('truetype'),
    url('/path-to-icon-font/icomoon.woff?fb26dz') format('woff'),
    url('/path-to-icon-font/icomoon.svg?fb26dz#icomoon') format('svg');
  font-weight: normal;
  font-style: normal;
}

[class^="icomoon-"], [class*=" icomoon-"] {
  /* use !important to prevent issues with browser extensions that change fonts */
  font-family: 'icomoon' !important;
  speak: none;
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;

  /* Better Font Rendering =========== */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.icomoon-hammer_icon:before {
  content: "\e900";
}

3. add hammer icon in your project
======================================

<i class="icomoon-hammer_icon"></i>
