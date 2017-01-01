const express = require('express')
const Promise = require('bluebird')
const passport = require('passport')
const FacebookStrategy = require('passport-facebook').Strategy
const FB = require('fb')
const Boom = require('boom')
const logger = require('hw-logger')
const log = logger.log
const helper = require('../../../../helper')
const config = require('../../../../config')
const router = express.Router()

router.get('/', (req, res, next) => passport.authenticate(
  'facebook', {
    scope: 'email',
    callbackURL: `${helper.getPublicBaseUrl(req)}${req.baseUrl}/callback`,
  })(req, res, next)
)

router.get('/callback',
  (req, res, next) => passport.authenticate('facebook', {
    failureRedirect: `${req.baseUrl}/fail`,
    callbackURL: `${helper.getPublicBaseUrl(req)}${req.baseUrl}/callback`,
  })(req, res, next),
  (req, res) => {
    const token = helper.createJwt(req.user)
    res.cookie('quizzy-user', JSON.stringify(req.user), {maxAge: config.cookiesMaxAge})
    res.cookie('quizzy-token', token, {maxAge: config.cookiesMaxAge})
    res.redirect('/')
  }
)

router.get('/fail', (req, res) => {
  log.warn('req.query :', req.query)
  Boom.forbidden('Login failed')
})

module.exports = passport => {
  passport.use(new FacebookStrategy(
    {
      clientID: config.get('auth.facebook.clientId'),
      clientSecret: config.get('auth.facebook.clientSecret'),
    },
    (accessToken, refreshToken, profile, done) => {
      logger.enabledLevels.debug && log.debug('facebook profile :', profile)
      return new Promise(
        (resolve, reject) => {
          FB.setAccessToken(accessToken)
          FB.api('/me', {fields: 'id,name,email'}, res => {
            if (res.error) {
              return reject(res.error)
            }
            resolve({
              provider: 'facebook',
              name: res.name,
              email: res.email,
            })
          })
        })
        .asCallback(done)
    }
  ))
  return router
}