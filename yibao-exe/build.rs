use std::path::PathBuf;
use std::process::Command;

/// 查找 Windows SDK 的 rc.exe（资源编译器），用于把 icon.rc（图标+VERSIONINFO）编译成 .res 并嵌入 exe。
fn find_rc() -> Option<PathBuf> {
    // 1) 环境变量 RC 指定
    if let Ok(p) = std::env::var("RC") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    // 2) Windows Kits 常见安装位置，按版本号从新到旧找
    let bases = [
        r"C:\Program Files (x86)\Windows Kits\10\bin",
        r"C:\Program Files\Windows Kits\10\bin",
    ];
    let mut found: Vec<PathBuf> = Vec::new();
    for base in bases {
        if let Ok(entries) = std::fs::read_dir(base) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                // 版本目录形如 10.0.26100.0
                if !name.starts_with("10.") {
                    continue;
                }
                for arch in ["x64", "arm64"] {
                    let rc = e.path().join(arch).join("rc.exe");
                    if rc.is_file() {
                        found.push(rc);
                    }
                }
            }
        }
    }
    // 选版本号最大的
    found.sort();
    found.pop()
}

fn main() {
    println!("cargo:rerun-if-changed=assets/icon.rc");
    println!("cargo:rerun-if-changed=assets/icon.ico");

    let rc = match find_rc() {
        Some(p) => p,
        None => {
            // 没有 rc.exe 时不阻断构建（图标嵌入失败仅影响 exe 文件图标，不影响功能）
            println!("cargo:warning=未找到 rc.exe，跳过 exe 图标与版本信息嵌入");
            return;
        }
    };
    println!("cargo:warning=使用资源编译器: {}", rc.display());

    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR");
    let res = PathBuf::from(&out_dir).join("yibao.res");

    let status = Command::new(&rc)
        .args([
            "/fo",
            &res.to_string_lossy().replace('/', "\\"),
            &std::env::current_dir()
                .expect("cwd")
                .join("assets")
                .join("icon.rc")
                .to_string_lossy()
                .replace('/', "\\"),
        ])
        .status()
        .expect("调用 rc.exe 失败");
    assert!(status.success(), "rc.exe 编译 icon.rc 失败");

    // 将 .res 作为链接参数传给链接器，嵌入到最终 exe
    println!("cargo:rustc-link-arg-bins={}", res.display());
}
