//! 蚂蚁哥医保查询 —— 本地单文件版（Rust）
//!
//! 将网页版全部静态资源（index.html / app.js / style.css / data.json / data.*.js / 图标）
//! 编译进 exe，启动后在本机 127.0.0.1 起一个静态服务并自动打开默认浏览器。
//! 无需 Python / Node，无需联网，双击即可使用；关闭窗口即停止服务。
//!
//! 版本号与网页版 / 仓库版保持一致：1.0.4

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::thread;

include!(concat!(env!("OUT_DIR"), "/assets_map.rs"));

const APP_NAME: &str = "蚂蚁哥医保查询";
const VERSION: &str = "1.0.4";

fn content_type(path: &str) -> &'static str {
    let p = path.to_ascii_lowercase();
    if p.ends_with(".html") || p.ends_with(".htm") {
        "text/html; charset=utf-8"
    } else if p.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if p.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if p.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if p.ends_with(".png") {
        "image/png"
    } else if p.ends_with(".jpg") || p.ends_with(".jpeg") {
        "image/jpeg"
    } else if p.ends_with(".svg") {
        "image/svg+xml"
    } else if p.ends_with(".ico") {
        "image/x-icon"
    } else {
        "application/octet-stream"
    }
}

fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

fn percent_decode(s: &str) -> Vec<u8> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex_val(b[i + 1]), hex_val(b[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    out
}

/// URL 路径 -> 内嵌资源键；None 表示拒绝（含 .. 等非法路径）
fn resolve(url_path: &str) -> Option<String> {
    let raw = url_path
        .split(|c| c == '?' || c == '#')
        .next()
        .unwrap_or("/");
    let decoded = String::from_utf8_lossy(&percent_decode(raw)).replace('\\', "/");
    let trimmed = decoded.trim_start_matches('/');
    if trimmed.is_empty() {
        return Some("index.html".to_string());
    }
    for seg in trimmed.split('/') {
        if seg.is_empty() || seg == "." || seg == ".." {
            return None;
        }
    }
    Some(trimmed.to_string())
}

fn handle(mut stream: TcpStream) {
    let mut buf = [0u8; 8192];
    let n = match stream.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return,
    };
    if n == 0 {
        return;
    }
    let req = String::from_utf8_lossy(&buf[..n]);
    let url_path = req
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .unwrap_or("/")
        .to_string();

    let key = resolve(&url_path);
    let (status, body, key_ok) = match key {
        None => ("403 Forbidden", b"403 Forbidden".to_vec(), None),
        Some(k) => match lookup(&k) {
            Some(bytes) => ("200 OK", bytes.to_vec(), Some(k)),
            None => ("404 Not Found", b"404 Not Found".to_vec(), None),
        },
    };
    let ct = match key_ok {
        Some(k) => content_type(&k),
        None => "text/plain; charset=utf-8",
    };
    let head = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        status,
        ct,
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(&body);
    let _ = stream.flush();
}

/// 依次尝试 8000-8010，返回已绑定的 listener 与端口
fn bind_local() -> (TcpListener, u16) {
    for p in 8000..=8010u16 {
        if let Ok(l) = TcpListener::bind(("127.0.0.1", p)) {
            return (l, p);
        }
    }
    eprintln!("无法绑定本地端口 8000-8010，请检查端口占用后重试。");
    std::process::exit(1);
}

fn main() {
    let (listener, port) = bind_local();
    let url = format!("http://127.0.0.1:{}/", port);

    // 设置控制台窗口标题（与浏览器打开互不影响，失败可忽略）
    let _ = Command::new("cmd")
        .args(["/c", "title", &format!("{} v{}", APP_NAME, VERSION)])
        .status();

    println!("===================================================");
    println!("  {} v{}", APP_NAME, VERSION);
    println!("  本地服务：{}", url);
    println!("  数据与网页版一致（2027 年度城乡居民医保），未联网也能用。");
    println!("  关闭本窗口或按 Ctrl+C 即停止服务。");
    println!("===================================================");

    // 自动打开默认浏览器；YIBAO_NO_BROWSER=1 时跳过（供测试用）
    if std::env::var("YIBAO_NO_BROWSER").is_err() {
        let opened = Command::new("cmd").args(["/c", "start", "", &url]).spawn();
        if opened.is_err() {
            println!("未能自动打开浏览器，请手动访问：{}", url);
        }
    }

    for stream in listener.incoming() {
        if let Ok(s) = stream {
            thread::spawn(|| handle(s));
        }
    }
}
