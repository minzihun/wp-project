//특정 URI/method가 왔을 때 처리하는 handler 등록
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  //req: http request, res: http response, next: 다음 middleware 호출
  res.render('index', { title: 'Express' });
});

module.exports = router;
