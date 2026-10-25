use std::env;
use std::fs;
use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=assets");
    let assets = Path::new("assets");
    let mut code = String::from(
        "// 由 build.rs 自动生成：内嵌资源路径 -> 文件字节\n\
         fn lookup(path: &str) -> Option<&'static [u8]> {\n    match path {\n",
    );
    collect(assets, "", &mut code);
    code.push_str("        _ => None,\n    }\n}\n");

    let out = env::var("OUT_DIR").expect("OUT_DIR");
    fs::write(Path::new(&out).join("assets_map.rs"), code).expect("write assets_map.rs");
}

fn collect(dir: &Path, prefix: &str, out: &mut String) {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .expect("read assets dir")
        .map(|e| e.expect("dir entry").path())
        .collect();
    entries.sort();
    for path in entries {
        let name = path
            .file_name()
            .expect("file name")
            .to_string_lossy()
            .to_string();
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", prefix, name)
        };
        if path.is_dir() {
            collect(&path, &rel, out);
        } else {
            let abs = env::current_dir()
                .expect("cwd")
                .join("assets")
                .join(&rel)
                .to_string_lossy()
                .replace('\\', "/");
            out.push_str(&format!("        {:?} => Some(include_bytes!({:?})),\n", rel, abs));
        }
    }
}
