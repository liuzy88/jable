module.exports = {
    TMP_DIR: 'JableTmp', // 缓存和临时文件
    IMG_DIR: 'JableImg', // 封面图片和视频输出
    MP4_DIR: 'Jable', // 封面图片和视频输出
    PROXY: '127.0.0.1:1087', // 出墙HTTP代理
    PAGES: 10, // 刷列表页数，最大约450
    RETRY: 8, // 下载文件最大重试次数
    THREAD: 10, // 下载ts文件并行个数
    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X -1_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36', // 浏览器标识
}
// 重写日志打印
const date = () => {
    let d = new Date()
    return [d.getFullYear(), '-',
        ('0' + (d.getMonth() + 1)).slice(-2), '-',
        ('0' + d.getDate()).slice(-2), ' ',
        ('0' + d.getHours()).slice(-2), ':',
        ('0' + d.getMinutes()).slice(-2), ':',
        ('0' + d.getSeconds()).slice(-2), ' '
    ].join('');
}
const log = console.log;
console.log = function (_) {
    process.stdout.write(date());
    log.apply(console, arguments);
}
const error = console.error;
console.log = function (_) {
    process.stderr.write(date());
    log.apply(console, arguments);
}