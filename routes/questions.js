const express = require('express');
const Question = require('../models/question');
const Answer = require('../models/answer'); 
const catchErrors = require('../lib/async-error');

const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');

module.exports = io => {
  const router = express.Router();
  
  // 동일한 코드가 users.js에도 있습니다. 이것은 나중에 수정합시다.
  function needAuth(req, res, next) {
    if (req.isAuthenticated()) {
      next();
    } else {
      req.flash('danger', 'Please signin first.');
      res.redirect('/signin');
    }
  }

  /* GET questions listing. */
  router.get('/', catchErrors(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    var query = {};
    const term = req.query.term;
    if (term) {
      query = {$or: [
        {title: {'$regex': term, '$options': 'i'}},
        {host: {'$regex': term, '$options': 'i'}},
        {field: {'$regex': term, '$options': 'i'}},
        {who: {'$regex': term, '$options': 'i'}},
        {priod: {'$regex': term, '$options': 'i'}},
        {content: {'$regex': term, '$options': 'i'}},
        {manager: {'$regex': term, '$options': 'i'}},
        {phone: {'$regex': term, '$options': 'i'}},
        {etc: {'$regex': term, '$options': 'i'}}
      ]};
    }
    const questions = await Question.paginate(query, {
      sort: {createdAt: -1}, 
      populate: 'author', 
      page: page, limit: limit
    });
    res.render('questions/index', {questions: questions, term: term, query: req.query});
  }));

  router.get('/new', needAuth, (req, res, next) => {
    res.render('questions/new', {question: {}});
  });

  router.get('/:id/edit', needAuth, catchErrors(async (req, res, next) => {
    const question = await Question.findById(req.params.id);
    res.render('questions/edit', {question: question});
  }));

  router.get('/:id', catchErrors(async (req, res, next) => {
    const question = await Question.findById(req.params.id).populate('author');
    const answers = await Answer.find({question: question.id}).populate('author');
    question.numReads++;    // TODO: 동일한 사람이 본 경우에 Read가 증가하지 않도록???

    await question.save();
    res.render('questions/show', {question: question, answers: answers});
  }));

  router.put('/:id', catchErrors(async (req, res, next) => {
    const question = await Question.findById(req.params.id);

    if (!question) {
      req.flash('danger', '공모전이 존재하지 않음');
      return res.redirect('back');
    }
    question.title = req.body.title;
    question.content = req.body.content;
    question.tags = req.body.tags.split(" ").map(e => e.trim());

    await question.save();
    req.flash('success', 'Successfully updated');
    res.redirect('/questions');
  }));

  router.delete('/:id', needAuth, catchErrors(async (req, res, next) => {
    await Question.findOneAndRemove({_id: req.params.id});
    req.flash('success', 'Successfully deleted');
    res.redirect('/questions');
  }));

  const mimetypes = {
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/png": "png"
  };
  const upload = multer({
    dest: 'tmp', 
    fileFilter: (req, file, cb) => {
      var ext = mimetypes[file.mimetype];
      if (!ext) {
        return cb(new Error('Only image files are allowed!'), false);
      }
      cb(null, true);
    }
  }); // tmp라는 폴더를 미리 만들고 해야 함.


  router.post('/', needAuth, upload.single('img'), catchErrors(async (req, res, next) => {
    const user = req.user;
    var question = new Question({
      title: req.body.title,
      author: user._id,
      host: req.body.host,
      field: req.body.field,
      who: req.body.who,
      priod: req.body.priod,
      content: req.body.content,
      manager: req.body.manager,
      phone: req.body.phone,
      etc: req.body.etc,
      tags: req.body.tags.split(" ").map(e => e.trim()),
    });
    if (req.file) {
      const dest = path.join(__dirname, '../public/images/uploads/');  // 옮길 디렉토리
      console.log("File ->", req.file); // multer의 output이 어떤 형태인지 보자.
      const filename = question.id + "/" + req.file.originalname;
      await fs.move(req.file.path, dest + filename);
      question.img = "/images/uploads/" + filename;
    }
    await question.save();
    req.flash('success', 'Successfully posted');
    res.redirect('/questions');
  }));

  router.post('/:id/answers', needAuth, catchErrors(async (req, res, next) => {
    const user = req.user;
    const question = await Question.findById(req.params.id);

    if (!question) {
      req.flash('danger', '공모전이 존재하지 않음');
      return res.redirect('back');
    }

    var answer = new Answer({
      author: user._id,
      question: question._id,
      content: req.body.content
    });
    await answer.save();
    question.numAnswers++;
    await question.save();

    const url = `/questions/${question._id}#${answer._id}`;
    io.to(question.author.toString())
      .emit('댓글이 달림', {url: url, question: question});
    console.log('SOCKET EMIT', question.author.toString(), '댓글이 달림', {url: url, question: question})
    req.flash('success', '댓글이 성공적으로 달렸습니다.');
    res.redirect(`/questions/${req.params.id}`);
  }));

  return router;
}