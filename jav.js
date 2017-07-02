#!/usr/bin/env node

// node env
// strict
'use strict';
// jquery like
var cheerio = require('cheerio');
// get
var request = require('request');
// async
var async = require('async');
// require colors
require('colors');
// cmd options
var program = require('commander');
// what is user_home, /home/kenpeter
var userHome = require('user-home');
// path
var path = require('path');
// file path
var fs = require('fs');
// mkdir with parent
var mkdirp = require('mkdirp');

// global var
// base url jabus
const baseUrl = 'https://www.javbus.com';
// search url search
const searchUrl = '/search';
// page index 1
var pageIndex = 1;
// current page html null
var currentPageHtml = null;

// commandar
program
  // version 0.6
  .version('0.6.0')
  // usage, options
  .usage('[options]')
  // op, parallel, default 2
  .option('-p, --parallel <num>', '设置抓取并发连接数，默认值：2', 2)
  // op, timeout 30s
  .option('-t, --timeout <num>', '自定义连接超时时间(毫秒)。默认值：30000毫秒')
  // op, limit, 0, no limit, how much image can get
  .option('-l, --limit <num>', '设置抓取影片的数量上限，0为抓取全部影片。默认值：0', 0)
  // op, output, path, path.join, /home/kenpeter/magnets
  .option('-o, --output <file_path>', '设置磁链和封面抓取结果的保存位置，默认为当前用户的主目录下的 magnets 文件夹', path.join(userHome, 'magnets'))
  // op, search keyword
  .option('-s, --search <string>', '搜索关键词，可只抓取搜索结果的磁链或封面')
  // op, base url
  .option('-b, --base <url>', '自定义抓取的起始页')
  // op, proxy url, -x http://127.x.x.x:8087
  .option('-x, --proxy <url>', '使用代理服务器, 例：-x http://127.0.0.1:8087')
  // now parse, process, argv
  .parse(process.argv);


// parallel, parse, int, program.x, 2
var parallel = parseInt(program.parallel);
// timeout, parse, int, proogram.x, 30000
var timeout = parseInt(program.timeout) || 30000;
// proxy....
var proxy = process.env.http_proxy || program.proxy;

// console.log('proxy: ', proxy);

// request with defaults
request = request.defaults({
  // timeout, 30000
  timeout: timeout,
  // headers,
  // refer, javbus
  headers: {
    'Referer': 'http://www.javbus.com',
    // cookie, exist mag, all
    'Cookie': 'existmag=all'
  }
});

// if proxy
if (proxy) {
  // request, request default
  request = request.defaults({
    // proxy
    'proxy': proxy
  });
}

// how much image can get
var count = parseInt(program.limit);

// has limit is condi
// count is also limit
// 0, no limit. or we have limit
var hasLimit = (count !== 0),
  targetFound = false; // target false

// output, ' or ", replace with nothing
var output = program.output.replace(/['"]/g, '');
// eror count 0
var errorCount = 0;

// green, base)url
console.log('========== 获取资源站点：%s =========='.green.bold, baseUrl);
// green, parallel
console.log('并行连接数：'.green, parallel.toString().green.bold, '      ',
  '连接超时设置：'.green, (timeout / 1000.0).toString().green.bold, '秒'.green); // timeout
// output
console.log('磁链保存位置: '.green, output.green.bold);
// proxy
console.log('代理服务器: '.green, (proxy ? proxy : '无').green.bold);

/****************************
 *****************************
 **** MAIN LOOP START ! ******
 ****************************
 ****************************/

// mkdir output
mkdirp.sync(output);

// async, during
// test, callback, error
async.during(
  // page exist is a func
  // this will run every time, before the below func, it is a test func
  pageExist,

  // when page exist
  function(callback) {
    // water fall take, array of func.
    // when first func done, pass arg to next
    async.waterfall(
      // array
      // parse links
      // get items
      [parseLinks, getItems],
      // func, error
      function(err) {
        // page index ++
        pageIndex++;

        if (err) return callback(err);
        callback(null);
      });
  },
  // page not exits or finished parsing
  // this will call when pageExist passes error or it is all done.
  function(err) {
    // error
    if (err) {
      console.log('抓取过程终止：%s', err.message);
      return process.exit(1);
    }
    //done.
    if (hasLimit && (count < 1)) {
      console.log('已尝试抓取%s部影片，本次抓取完毕'.green.bold, program.limit);
    } else {
      console.log('抓取完毕'.green.bold);
    }
    //
    return process.exit(0); // 不等待未完成的异步请求，直接结束进程
  }
);

/****************************
 *****************************
 **** MAIN LOOP END ! ******
 ****************************
 ****************************/

function parseLinks(next) {
  let $ = cheerio.load(currentPageHtml);
  let links = [],
    fanhao = [];
  let totalCountCurPage = $('a.movie-box').length;
  if (hasLimit) {
    if (count > totalCountCurPage) {
      $('a.movie-box').each(link_fanhao_handler);
    } else {
      $('a.movie-box').slice(0, count).each(link_fanhao_handler);
    }
  } else {
    $('a.movie-box').each(link_fanhao_handler);
  }
  if (program.search && links.length == 1) {
    targetFound = true;
  }

  function link_fanhao_handler() {
    let link = $(this).attr('href');
    links.push(link);
    fanhao.push(link.split('/').pop());
  }

  console.log('正处理以下番号影片...\n'.green + fanhao.toString().yellow);
  next(null, links);
}

function getItems(links, next) {
  async.forEachOfLimit(
    links,
    parallel,
    getItemPage,
    function(err) {
      if (err) {
        if (err.message === 'limit') {
          return next();
        }
        throw err;
      }
      console.log('===== 第%d页处理完毕 ====='.green, pageIndex);
      console.log();
      return next();
    });
}

//
function pageExist(callback) {

  //test
  //debugger;

  if (hasLimit && (count < 1) || targetFound) {
    return callback();
  }

  // base_url === javbus.com
  // pageIndex = 1
  var url = baseUrl + (pageIndex === 1 ? '' : ('/page/' + pageIndex));
  // no search....
  if (program.search) {
    // javbus.com/search/xxxx
    url = baseUrl + searchUrl + '/' + encodeURI(program.search) + (pageIndex === 1 ? '' : ('/' + pageIndex));
  } else if (program.base) {
    // no program base
    url = program.base + (pageIndex === 1 ? '' : ('/' + pageIndex));
  } else {
    // 只在没有指定搜索条件时显示
    // no search
    console.log('获取第%d页中的影片链接 ( %s )...'.green, pageIndex, url);
  }

  // retry count = 1
  let retryCount = 1;
  // async, redo, 3
  async.retry(
    // redo 3 times, 1st param
    3,

    // retry callback, 2nd param
    function(callback) {
      // op
      let options = {
        // headers, cookie, exist, mag = all
        headers: {
          'Cookie': 'existmag=all'
        }
      }

      // request, get, url
      // func, err, res, body
      request
        .get(url, function(err, res, body) {
          // if err
          if (err) {
            // err status, 404
            if (err.status === 404) {
              // 404, so done
              console.error('已抓取完所有页面, StatusCode:', err.status);
            } else {
              // retry count
              retryCount++;
              // get particular page fail
              console.error('第%d页页面获取失败：%s'.red, pageIndex, err.message);
              // now retry
              console.error('...进行第%d次尝试...'.red, retryCount);
            }

            // return error with callback
            return callback(err);
          }

          // curr_page with body, if good
          currentPageHtml = body;
          // back, null, res

          //test
          //debugger;

          // body is like all title, images, html markup...
          // callback(error, result), inside, seriesCallback and final attemptW
          callback(null, res);
        }); // end get
    }, // end callback func in async.retry

    // 3rd param
    // func, err, res
    function(err, res) {
      // error
      if (err) {
        // error 404
        if (err.status === 404) {
          // callback, null, false
          return callback(null, false);
        }
        // still error
        return callback(err);
      }

      // other wise, good, null
      // res status 200
      callback(null, res.statusCode == 200);
    });
}


function parse(script) {
  let gid_r = /gid\s+=\s+(\d+)/g.exec(script);
  let gid = gid_r[1];
  let uc_r = /uc\s+=\s(\d+)/g.exec(script);
  let uc = uc_r[1];
  let img_r = /img\s+=\s+\'(\http.+\.jpg)/g.exec(script);
  let img = img_r[1];
  return {
    gid: gid,
    img: img,
    uc: uc,
    lang: 'zh'
  };
}

function getItemPage(link, index, callback) {
  let fanhao = link.split('/').pop();
  let coverFilePath = path.join(output, fanhao + '.jpg');
  let magnetFilePath = path.join(output, fanhao + '.txt');
  if (hasLimit) {
    count--;
  }
  try {
    fs.accessSync(coverFilePath, fs.F_OK);
    fs.accessSync(magnetFilePath, fs.F_OK);
    console.log(('[' + fanhao + ']').yellow.bold.inverse + ' ' + 'Alreday fetched, SKIP!'.yellow);
    return callback();
  } catch (e) {
    request
      .get(link, function(err, res, body) {
        if (err) {
          console.error(('[' + fanhao + ']').red.bold.inverse + ' ' + err.message.red);
          errorCount++;
          return callback(null);
        }
        let $ = cheerio.load(body);
        let script = $('script', 'body').eq(2).html();
        let meta = parse(script);

        $("div.col-md-3 > p").each(function(i, e){
          let text = $(e).text();
          meta.category = [];
          if(text.includes("發行日期:")){
            meta.date = text.replace("發行日期: ", "");
          }else if(text.includes("系列:")){
            meta.series = text.replace("系列:", "");
          }else if(text.includes("類別:")){
            $("div.col-md-3 > p > span.genre").each(function(idx, span){
              let $span = $(span);
              if(!$span.attr("onmouseover")){
                meta.category.push($span.text());
              }
            });
          }
        });
        // 提取演员
        meta.actress = [];
        $("span.genre").each(function(i, e){
          let $e = $(e);
          if($e.attr("onmouseover")){
            meta.actress.push($e.find("a").text());
          }
        });
        // 提取片名
        meta.title = $("h3").text();

        getItemMagnet(link, meta, callback);
      });
  }
}

function getItemMagnet(link, meta, done) {
  let fanhao = link.split('/').pop();
  let itemOutput = output + "/" + fanhao
  mkdirp.sync(itemOutput);
  let magnetFilePath = path.join(itemOutput, fanhao + '.json');
  fs.access(magnetFilePath, fs.F_OK, function(err) {
    if (err) {
      request
        .get(baseUrl + '/ajax/uncledatoolsbyajax.php?gid=' + meta.gid + '&lang=' + meta.lang + '&img=' + meta.img + '&uc=' + meta.uc + '&floor=' + Math.floor(Math.random() * 1e3 + 1),
          function(err, res, body) {
            if (err) {
              console.error(('[' + fanhao + ']').red.bold.inverse + ' ' + err.message.red);
              errorCount++;
              return done(null); // one magnet fetch fail, do not crash the whole task.
            }
            let $ = cheerio.load(body);
            // 尝试解析高清磁链
            let HDAnchor = $('a[title="包含高清HD的磁力連結"]').parent().attr('href');
            // 尝试解析普通磁链
            let anchor = $('a[title="滑鼠右鍵點擊並選擇【複製連結網址】"]').attr('href');
            // 若存在高清磁链，则优先选取高清磁链
            anchor = HDAnchor || anchor;
            // 将磁链单独存入文本文件以方便下载
            if (anchor) {
              fs.writeFile(path.join(itemOutput, fanhao + '-magnet.txt'), anchor,function(err){
                if (err) {
                  throw err;
                }
              });
            }

            // // 再加上一些影片信息
            let jsonText = "{\n\t\"title\":\"" + meta.title + "\",\n\t\"date\":\"" + meta.date + "\",\n\t\"series\":\"" + meta.series + "\",\n\t\"anchor\":\"" + anchor + "\",\n\t\"category\":[\n\t\t";
            for (var i = 0; i < meta.category.length; i++) {
              jsonText += i == 0 ?  "\"" + meta.category[i] + "\"" : ",\n\t\t\"" + meta.category[i] + "\"";
            }
            jsonText += "\n\t],\n\t\"actress\":[\n\t\t";
            for (var i = 0; i < meta.actress.length; i++) {
              jsonText += i == 0 ?  "\"" + meta.actress[i] + "\"" : ",\n\t\t\"" + meta.actress[i] + "\"";
            }
            jsonText += "\n\t]\n}";

            if (jsonText) { // magnet file not exists
              fs.writeFile(magnetFilePath, jsonText + '\r\n',
                function(err) {
                  if (err) {
                    throw err;
                  }
                  console.log(('[' + fanhao + ']').green.bold.inverse + '[磁链]'.yellow.inverse + (HDAnchor ? '[HD]'.blue.bold.inverse : ''), anchor);
                  getItemCover(link, meta, done);
                });
            } else {
              getItemCover(link, meta, done); // 若尚未有磁链则仅抓取封面
            }
          });
    } else {
      console.log(('[' + fanhao + ']').green.bold.inverse + '[磁链]'.yellow.inverse, 'file already exists, skip!'.yellow);
      getItemCover(link, meta, done);
    }
  })
}

function getItemCover(link, meta, done) {
  var fanhao = link.split('/').pop();
  var filename = fanhao + 'l.jpg';
  let itemOutput = output + "/" + fanhao
  mkdirp.sync(itemOutput);
  var fileFullPath = path.join(itemOutput, filename);
  fs.access(fileFullPath, fs.F_OK, function(err) {
    if (err) {
      var coverFileStream = fs.createWriteStream(fileFullPath + '.part');
      var finished = false;
      request.get(meta.img)
        .on('end', function() {
          if (!finished) {
            fs.renameSync(fileFullPath + '.part', fileFullPath);
            finished = true;
            console.error(('[' + fanhao + ']').green.bold.inverse + '[封面]'.yellow.inverse, fileFullPath);
            getItemSmallCover(link, meta, done);
          }
        })
        .on('error', function(err) {
          if (!finished) {
            finished = true;
            console.error(('[' + fanhao + ']').red.bold.inverse + '[封面]'.yellow.inverse, err.message.red);
            errorCount++;
            getItemSmallCover(link, meta, done);
          }
        })
        .pipe(coverFileStream);
    } else {
      console.log(('[' + fanhao + ']').green.bold.inverse + '[封面]'.yellow.inverse, 'file already exists, skip!'.yellow);
      getItemSmallCover(link, meta, done);
    }
  })
}

// 获取封面小图
function getItemSmallCover(link, meta, done) {
  // 大图地址：
  // https://pics.javbus.info/cover/5cfb_b.jpg
  // 小图地址:
  // https://pics.javbus.info/thumb/5cfb.jpg
  var fanhao = link.split('/').pop();
  var filename = fanhao + 's.jpg';
  let itemOutput = output + "/" + fanhao
  mkdirp.sync(itemOutput);
  var fileFullPath = path.join(itemOutput, filename);
  fs.access(fileFullPath, fs.F_OK, function(err) {
    if (err) {
      var coverFileStream = fs.createWriteStream(fileFullPath + '.part');
      var finished = false;
      request.get(meta.img.replace("cover", "thumb").replace("_b", ""))
        .on('end', function() {
          if (!finished) {
            fs.renameSync(fileFullPath + '.part', fileFullPath);
            finished = true;
            console.error(('[' + fanhao + ']').green.bold.inverse + '[小封面]'.yellow.inverse, fileFullPath);
            return done();
          }
        })
        .on('error', function(err) {
          if (!finished) {
            finished = true;
            console.error(('[' + fanhao + ']').red.bold.inverse + '[小封面]'.yellow.inverse, err.message.red);
            errorCount++;
            return done();
          }
        })
        .pipe(coverFileStream);
    } else {
      console.log(('[' + fanhao + ']').green.bold.inverse + '[小封面]'.yellow.inverse, 'file already exists, skip!'.yellow);
      return done();
    }
  })
}
