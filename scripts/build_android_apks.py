"""Build signed release Android APKs for OCA Staff & OCA Student portals."""
import os
import shutil
import subprocess

TARGETS = [
    (
        'staff',
        'OCA',
        'com.ocaacademy.staff',
        'https://ocaacademy.github.io/OCA/',
        'icon-512.png',
        'OCA-Staff.apk',
    ),
    (
        'student',
        'OCA Student',
        'com.ocaacademy.student',
        'https://ocaacademy.github.io/OCA/student/',
        'student-icon-512.png',
        'OCA-Student.apk',
    ),
]


def run(cmd, cwd=None):
    """Run a shell command and fail loudly on non-zero exit."""
    print('>>>', ' '.join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def write_text(path, content):
    """Create parent dirs and write UTF-8 text."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


def main():
    """Generate keystore and assemble signed release APKs for both portals."""
    os.makedirs('out-apks', exist_ok=True)
    if os.path.exists('oca-release.jks'):
        os.remove('oca-release.jks')
    run([
        'keytool', '-genkeypair', '-v',
        '-keystore', 'oca-release.jks',
        '-alias', 'oca',
        '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
        '-storepass', 'oca2569pass', '-keypass', 'oca2569pass',
        '-dname', 'CN=Oriental Culture Academy, O=OCA, C=TH',
    ])

    for tid, label, pkg, url, icon, out_name in TARGETS:
        proj = os.path.abspath(f'app-{tid}')
        shutil.rmtree(proj, ignore_errors=True)
        pkg_path = pkg.replace('.', '/')
        os.makedirs(os.path.join(proj, 'app/src/main/res/mipmap-xxxhdpi'), exist_ok=True)
        shutil.copy2(icon, os.path.join(proj, 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'))

        write_text(os.path.join(proj, 'settings.gradle'), 'rootProject.name = "OCAApp"\ninclude ":app"\n')
        write_text(
            os.path.join(proj, 'build.gradle'),
            'buildscript {\n'
            '  repositories { google(); mavenCentral() }\n'
            '  dependencies { classpath "com.android.tools.build:gradle:8.2.2" }\n'
            '}\n'
            'allprojects { repositories { google(); mavenCentral() } }\n',
        )
        write_text(
            os.path.join(proj, 'app/build.gradle'),
            f'apply plugin: "com.android.application"\n'
            f'android {{\n'
            f'  namespace "{pkg}"\n'
            f'  compileSdk 34\n'
            f'  defaultConfig {{\n'
            f'    applicationId "{pkg}"\n'
            f'    minSdk 24\n'
            f'    targetSdk 34\n'
            f'    versionCode 393\n'
            f'    versionName "3.9.3"\n'
            f'  }}\n'
            f'  signingConfigs {{\n'
            f'    release {{\n'
            f'      storeFile file("{os.path.abspath("oca-release.jks")}")\n'
            f'      storePassword "oca2569pass"\n'
            f'      keyAlias "oca"\n'
            f'      keyPassword "oca2569pass"\n'
            f'    }}\n'
            f'  }}\n'
            f'  buildTypes {{\n'
            f'    release {{\n'
            f'      signingConfig signingConfigs.release\n'
            f'      minifyEnabled false\n'
            f'    }}\n'
            f'  }}\n'
            f'}}\n',
        )
        write_text(
            os.path.join(proj, 'app/src/main/res/values/strings.xml'),
            f'<resources><string name="app_name">{label}</string></resources>\n',
        )
        write_text(
            os.path.join(proj, 'app/src/main/AndroidManifest.xml'),
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '  <uses-permission android:name="android.permission.INTERNET" />\n'
            '  <uses-permission android:name="android.permission.CAMERA" />\n'
            '  <application android:label="@string/app_name" android:icon="@mipmap/ic_launcher" '
            'android:theme="@android:style/Theme.NoTitleBar" android:usesCleartextTraffic="false">\n'
            '    <activity android:name=".MainActivity" android:exported="true" '
            'android:configChanges="orientation|screenSize|keyboardHidden">\n'
            '      <intent-filter>\n'
            '        <action android:name="android.intent.action.MAIN" />\n'
            '        <category android:name="android.intent.category.LAUNCHER" />\n'
            '      </intent-filter>\n'
            '    </activity>\n'
            '  </application>\n'
            '</manifest>\n',
        )
        write_text(
            os.path.join(proj, f'app/src/main/java/{pkg_path}/MainActivity.java'),
            f'package {pkg};\n'
            'import android.app.Activity;\n'
            'import android.content.Intent;\n'
            'import android.net.Uri;\n'
            'import android.os.Bundle;\n'
            'import android.webkit.*;\n'
            'public class MainActivity extends Activity {\n'
            '  private WebView webView;\n'
            '  private ValueCallback<Uri[]> fileCallback;\n'
            '  @Override\n'
            '  protected void onCreate(Bundle savedInstanceState) {\n'
            '    super.onCreate(savedInstanceState);\n'
            '    webView = new WebView(this);\n'
            '    setContentView(webView);\n'
            '    WebSettings s = webView.getSettings();\n'
            '    s.setJavaScriptEnabled(true);\n'
            '    s.setDomStorageEnabled(true);\n'
            '    s.setAllowFileAccess(true);\n'
            '    s.setMediaPlaybackRequiresUserGesture(false);\n'
            '    webView.setWebViewClient(new WebViewClient() {\n'
            '      @Override\n'
            '      public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {\n'
            '        String u = req.getUrl().toString();\n'
            '        if (u.startsWith("https://ocaacademy.github.io/OCA/")) return false;\n'
            '        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));\n'
            '        return true;\n'
            '      }\n'
            '    });\n'
            '    webView.setWebChromeClient(new WebChromeClient() {\n'
            '      @Override\n'
            '      public void onPermissionRequest(PermissionRequest r) { r.grant(r.getResources()); }\n'
            '      @Override\n'
            '      public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {\n'
            '        fileCallback = cb;\n'
            '        startActivityForResult(p.createIntent(), 1001);\n'
            '        return true;\n'
            '      }\n'
            '    });\n'
            f'    webView.loadUrl("{url}");\n'
            '  }\n'
            '  @Override\n'
            '  protected void onActivityResult(int req, int res, Intent data) {\n'
            '    if (req == 1001 && fileCallback != null) {\n'
            '      fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));\n'
            '      fileCallback = null;\n'
            '    }\n'
            '  }\n'
            '  @Override\n'
            '  public void onBackPressed() {\n'
            '    if (webView != null && webView.canGoBack()) webView.goBack();\n'
            '    else super.onBackPressed();\n'
            '  }\n'
            '}\n',
        )
        run(['gradle', '-p', proj, 'assembleRelease'])
        shutil.copy2(os.path.join(proj, 'app/build/outputs/apk/release/app-release.apk'), os.path.join('out-apks', out_name))
        print('Built APK:', out_name)


if __name__ == '__main__':
    main()
