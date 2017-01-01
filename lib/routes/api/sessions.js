const Promise = require('bluebird')
const express = require('express')
const _ = require('lodash')
const bodyParser = require('../../services/body-parser')
const moment = require('moment')
const Boom = require('boom')
const request = require('request')
const requestAsync = Promise.promisify(request, {multiArgs: true})
const config = require('../../config')
const helper = require('../../helper')
const logger = require('hw-logger')
const log = logger.log

module.exports = store => {

  const router = express.Router()

  router.post('/', helper.checkAuth(true), bodyParser, (req, res, next) => {
    const user = _.get(res, 'locals.user')
    const now = moment()
    store.getQuiz(req.body && req.body.quizId)
      .then(quiz => store.findSessions(user.email)
        .then(userSessions => {
          userSessions = Array.isArray(userSessions) ? userSessions : [userSessions]
          if (userSessions.filter(userSession => userSession.quizId === quiz.id).length) {
            throw Boom.conflict()
          }
        })
        .catch(store.errors.NotFoundError, _.noop)
        .return(quiz)
      )
      .then(quiz => {
        const sessionId = `${user.email}:${quiz.id}`
        const maxScore = quiz.questions.reduce((max, question) => {
          const scores = question.choices.map(choice => choice.score || 0)
          return max + Math.max(...scores)
        }, 0)
        const session = (req.body && req.body.answers || {})
          .reduce((session, answer, index) => {
            const question = quiz.questions[index]
            const choice = question && question.choices[answer - 1]
            const score = choice && choice.score || 0
            session.score += score
            session.answers.push({question, choice: choice.value, score})
            return session
          }, {
            id: sessionId,
            created: now.format('YYYY-MM-DD hh:mm:ss'),
            user,
            quizId: quiz.id,
            answers: [],
            score: 0,
            max: maxScore,
          })
        session.result = quiz.results && _.get(quiz.results,
            _.first(
              Object.keys(quiz.results)
                .map(key => parseInt(key))
                .sort((a, b) => b - a)
                .filter(key => session.score >= key)
            ))
        return store.saveSession(session)
      })
      .then(session => {
        const url = config.get('hooks.quizSession.url')
        if (!url) {
          return session
        }
        const reqOpt = {
          method: 'post',
          url,
          json: true,
          body: Object.assign({'@timestamp': now.format()}, session)
        }
        const { username, password } = config.get('hooks.quizSession', {})
        if (username) {
          reqOpt.auth = {
            user: username,
            pass: password,
          }
        }
        return requestAsync(reqOpt)
          .spread((res, body) => {
            logger.enabledLevels.info && log.info('hook status code :', res.statusCode)
            logger.enabledLevels.trace && log.trace('hook body :', body)
          })
          .catch(err => {
            logger.enabledLevels.warn && log.warn('hook error :', err)
          })
          .return(session)
      })
      .then(data => {
        res.status(201).renderData(data)
      })
      .catch(next)
  })

  router.get('/', helper.checkAuth(), (req, res, next) => {
    const user = _.get(res, 'locals.user')
    store.findSessions(user.email)
      .then(data => {
        res.renderData(data)
      })
      .catch(next)
  })

  router.get('/:email', helper.checkAuth(), (req, res, next) => {
    const email = res.locals.isAdmin ? req.params.email : res.locals.user.email
    store.findSessions(email)
      .then(data => {
        res.renderData(data)
      })
      .catch(next)
  })

  router.get('/:email/:quizId', helper.checkAuth(), (req, res, next) => {
    const email = res.locals.isAdmin ? req.params.email : res.locals.user.email
    store.findSessions(email, req.params.quizId)
      .then(data => {
        res.renderData(data)
      })
      .catch(next)
  })

  return router
}