# Changelog

## [0.0.7](https://github.com/aeron-playground/Opentrail/compare/v0.0.6...v0.0.7) (2026-10-02)


### Features

* **api:** add the groundwork for swap quotes ([#94](https://github.com/aeron-playground/Opentrail/issues/94)) ([d40455e](https://github.com/aeron-playground/Opentrail/commit/d40455ed7296b226ae75e0f14e0c6b3bff0f9051))
* **api:** add the platform fee settings and checks ([#92](https://github.com/aeron-playground/Opentrail/issues/92)) ([947ae85](https://github.com/aeron-playground/Opentrail/commit/947ae855121f77622f2edbd6d6079a0f883fa9f0))
* **api:** get swap instructions from jupiter ([#90](https://github.com/aeron-playground/Opentrail/issues/90)) ([2e74027](https://github.com/aeron-playground/Opentrail/commit/2e740278fcff57677124524dd51f0a35962796a4))
* **api:** quote a trade with post /v1/swaps/quote ([#95](https://github.com/aeron-playground/Opentrail/issues/95)) ([da9a142](https://github.com/aeron-playground/Opentrail/commit/da9a142ea90224c0f77942eae005b8b39510211e))
* **solana:** build and check swap transactions ([#88](https://github.com/aeron-playground/Opentrail/issues/88)) ([17c5ab7](https://github.com/aeron-playground/Opentrail/commit/17c5ab79dd2435957b77804a3aa1f19fcd359293))


### Documentation

* **docs:** record how trades use jupiter's swap instructions ([#85](https://github.com/aeron-playground/Opentrail/issues/85)) ([e1c888c](https://github.com/aeron-playground/Opentrail/commit/e1c888ce30760dd8fc98d7bc33600c72de9a1807))

## [0.0.6](https://github.com/aeron-playground/Opentrail/compare/v0.0.5...v0.0.6) (2026-09-30)


### Features

* **indexer:** check token safety and fill token stats ([#83](https://github.com/aeron-playground/Opentrail/issues/83)) ([a22a830](https://github.com/aeron-playground/Opentrail/commit/a22a8303d6e42a091d5cf2d02a712e0c3b1a8451))
* **web:** build the token page ([#80](https://github.com/aeron-playground/Opentrail/issues/80)) ([f15c8bd](https://github.com/aeron-playground/Opentrail/commit/f15c8bdcfe72db3f1af1e2c93989b8e12bc51ded))

## [0.0.5](https://github.com/aeron-playground/Opentrail/compare/v0.0.4...v0.0.5) (2026-09-30)


### Features

* **api:** serve tokens, prices and candles ([#73](https://github.com/aeron-playground/Opentrail/issues/73)) ([7a55dc6](https://github.com/aeron-playground/Opentrail/commit/7a55dc69893dfe194c885b2aec761fe1a9479a1c))
* **web:** build the explore page ([#76](https://github.com/aeron-playground/Opentrail/issues/76)) ([5084e36](https://github.com/aeron-playground/Opentrail/commit/5084e36d34ad70a093fbc30c5074f74dd9c9cc11))


### Bug fixes

* **deps:** upgrade next to 16.3.6 ([#78](https://github.com/aeron-playground/Opentrail/issues/78)) ([e7e0299](https://github.com/aeron-playground/Opentrail/commit/e7e02995be7244eb6c2b204faf1398ebc533687b))

## [0.0.4](https://github.com/aeron-playground/Opentrail/compare/v0.0.3...v0.0.4) (2026-09-29)


### Features

* **db:** add the token registry ([#66](https://github.com/aeron-playground/Opentrail/issues/66)) ([75bcfe6](https://github.com/aeron-playground/Opentrail/commit/75bcfe6ff862e55509e6c8c84e6870c75e9107b1))
* **indexer:** fetch price candles from geckoterminal ([#71](https://github.com/aeron-playground/Opentrail/issues/71)) ([5a50e3c](https://github.com/aeron-playground/Opentrail/commit/5a50e3c8867b1948ec5f15038c0e9a38163c66a5))
* **indexer:** refresh token prices and push them live ([#69](https://github.com/aeron-playground/Opentrail/issues/69)) ([55a21e9](https://github.com/aeron-playground/Opentrail/commit/55a21e999fc490e4d977f9aa3d08a451000835a2))

## [0.0.3](https://github.com/aeron-playground/Opentrail/compare/v0.0.2...v0.0.3) (2026-09-28)


### Features

* **api:** check privy sign-in and add get /v1/me ([#48](https://github.com/aeron-playground/Opentrail/issues/48)) ([e85422c](https://github.com/aeron-playground/Opentrail/commit/e85422c3b76d09604f440a2a3c45d10b7a1dccf2))
* **api:** let people choose a username ([#51](https://github.com/aeron-playground/Opentrail/issues/51)) ([bdd647d](https://github.com/aeron-playground/Opentrail/commit/bdd647d4846543d806163f1ed7da90b0cd483301))
* **api:** push live balance updates over a websocket ([#61](https://github.com/aeron-playground/Opentrail/issues/61)) ([d63a6ab](https://github.com/aeron-playground/Opentrail/commit/d63a6ab8546bd98358ebc333e7b7b1574077069a))
* **api:** show balances and a qr code on add funds ([#57](https://github.com/aeron-playground/Opentrail/issues/57)) ([3174363](https://github.com/aeron-playground/Opentrail/commit/3174363f2c2ef39d692c29524ca158febdf95ed9))
* **indexer:** record deposits from helius ([#59](https://github.com/aeron-playground/Opentrail/issues/59)) ([b967e91](https://github.com/aeron-playground/Opentrail/commit/b967e918a6c4be8061f7a2b7082a4df883da1e02))
* **web:** add onboarding and username and wallet settings ([#55](https://github.com/aeron-playground/Opentrail/issues/55)) ([3033005](https://github.com/aeron-playground/Opentrail/commit/30330059296a50c37642cb596ac2f5b56ffe6665))
* **web:** sign in and sign out with privy ([#53](https://github.com/aeron-playground/Opentrail/issues/53)) ([c98828f](https://github.com/aeron-playground/Opentrail/commit/c98828fb5c31f94b630209a8e9b2ce9015987fe3))

## [0.0.2](https://github.com/aeron-playground/Opentrail/compare/v0.0.1...v0.0.2) (2026-09-25)


### Features

* **api:** add api skeleton with health and openapi routes ([#20](https://github.com/aeron-playground/Opentrail/issues/20)) ([5d74349](https://github.com/aeron-playground/Opentrail/commit/5d74349387d471f544eb7c1e36af37b331f8cbeb))
* **docs:** add the docs site ([#37](https://github.com/aeron-playground/Opentrail/issues/37)) ([e03d8cd](https://github.com/aeron-playground/Opentrail/commit/e03d8cd2041c721e6ff0a64b48d8b4e7697fe11c))
* **docs:** publish the docs site with pull request previews ([#39](https://github.com/aeron-playground/Opentrail/issues/39)) ([dbd14e0](https://github.com/aeron-playground/Opentrail/commit/dbd14e055609a91bb04546d6ca2eafcdc0ba2a53))
* **format:** add the formatting library ([#43](https://github.com/aeron-playground/Opentrail/issues/43)) ([e171222](https://github.com/aeron-playground/Opentrail/commit/e1712221825944a8c225681da3d56f92fdb0c721))
* **indexer:** add indexer skeleton with webhooks and scheduler ([#27](https://github.com/aeron-playground/Opentrail/issues/27)) ([1b0c6b9](https://github.com/aeron-playground/Opentrail/commit/1b0c6b9112a1b8add02d04e49204798d859b6500))
* **pnl:** add the pnl engine and shared limits ([#42](https://github.com/aeron-playground/Opentrail/issues/42)) ([6550cc2](https://github.com/aeron-playground/Opentrail/commit/6550cc2e68862228a91520dd8ac2cb8702d36edb))
* **repo:** add docker images for the api and indexer ([#29](https://github.com/aeron-playground/Opentrail/issues/29)) ([7f635bb](https://github.com/aeron-playground/Opentrail/commit/7f635bbe8efebaa947e45d98afb575495c58e794))
* **web:** add the app shell and theme switch ([#33](https://github.com/aeron-playground/Opentrail/issues/33)) ([11ae92e](https://github.com/aeron-playground/Opentrail/commit/11ae92e9c0e7f6c0bf4c8aa645a70d1daac1dfbb))
* **web:** add the web app foundation with design tokens ([#32](https://github.com/aeron-playground/Opentrail/issues/32)) ([9e0a5d8](https://github.com/aeron-playground/Opentrail/commit/9e0a5d823cfd434ac6f927f3a34582cb8e5ce8cd))


### Documentation

* **docs:** add the first architecture decision records ([#38](https://github.com/aeron-playground/Opentrail/issues/38)) ([f4e78d8](https://github.com/aeron-playground/Opentrail/commit/f4e78d8ff6e3bf0223a2804958d2f5115ff10aed))
* **docs:** record the choice of @solana/kit for privy signing ([#46](https://github.com/aeron-playground/Opentrail/issues/46)) ([d3855ae](https://github.com/aeron-playground/Opentrail/commit/d3855aeebea40c56677f14c794c36a0eff3aa4e9))

## 0.0.1 (2026-09-24)


### Features

* **db:** add local postgres and users table ([#11](https://github.com/aeron-playground/Opentrail/issues/11)) ([6b075c7](https://github.com/aeron-playground/Opentrail/commit/6b075c749cfdcb6103e11d0d33eed54b3df382e4))


### Bug fixes

* **release:** start the first release at 0.0.1 ([#18](https://github.com/aeron-playground/Opentrail/issues/18)) ([b3be139](https://github.com/aeron-playground/Opentrail/commit/b3be139d78592af262d55ba792119ba11702662f))


### Documentation

* **repo:** add community and contribution files ([#9](https://github.com/aeron-playground/Opentrail/issues/9)) ([1387494](https://github.com/aeron-playground/Opentrail/commit/138749467d7933a79076fbbcb7cd74794f732356))
