using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("宇的数学大观离线版")]
[assembly: System.Reflection.AssemblyProduct("宇的数学大观离线版")]
[assembly: System.Reflection.AssemblyVersion("1.1.0.0")]

internal static class Program
{
    internal const string Title = "宇的数学大观离线版";
    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string root = AppDomain.CurrentDomain.BaseDirectory;
        if (Path.GetFullPath(root).TrimEnd('\\').StartsWith(@"D:\desktop\文档\secret", StringComparison.OrdinalIgnoreCase)) return 1;
        if (args.Length == 1 && args[0] == "--smoke-test")
        {
            try { SmokeTest(root).GetAwaiter().GetResult(); return 0; }
            catch (Exception e) { File.WriteAllText(Path.Combine(root, "launcher-smoke-error.log"), e.ToString()); return 1; }
        }
        try
        {
            string key;
            using (var hash = SHA256.Create()) key = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(Path.GetFullPath(root).ToUpperInvariant()))).Replace("-", "");
            bool created;
            using (var mutex = new Mutex(true, @"Local\YuMath-" + key, out created))
            {
                if (!created)
                {
                    for (int i = 0; i < 50; i++)
                    {
                        try { using (var signal = EventWaitHandle.OpenExisting(@"Local\YuMathOpen-" + key)) signal.Set(); return 0; }
                        catch (WaitHandleCannotBeOpenedException) { Thread.Sleep(100); }
                    }
                    MessageBox.Show("程序正在启动，请稍后重试。", Title); return 0;
                }
                using (var signal = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\YuMathOpen-" + key))
                using (var form = new LauncherWindow(root, signal)) Application.Run(form);
                mutex.ReleaseMutex();
            }
            return 0;
        }
        catch (Exception e) { MessageBox.Show("无法启动：" + e.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
    }

    private static async Task SmokeTest(string root)
    {
        using (var service = new LocalService(root))
        {
            await service.Start();
            using (var client = new WebClient())
            {
                client.Proxy = null;
                client.Encoding = Encoding.UTF8;
                if (!client.DownloadString(service.Origin + "/data/questions.json").Contains("exam_subjects")) throw new Exception("Library unavailable");
                if (!client.DownloadString(service.Origin + "/api/progress").Contains("records")) throw new Exception("Progress unavailable");
                if (!client.DownloadString(service.Origin + "/").Contains("宇的数学大观离线版")) throw new Exception("Page unavailable");
            }
            await service.Stop();
            if (!service.HasExited) throw new Exception("Service did not stop");
        }
    }
}

internal sealed class LauncherWindow : Form
{
    private readonly LocalService service;
    private readonly EventWaitHandle signal;
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private readonly Label status = new Label();
    private readonly Button open = new Button();
    private bool closing, allowClose, ready;
    private Task startup;
    internal LauncherWindow(string root, EventWaitHandle signal)
    {
        this.signal = signal;
        service = new LocalService(root);
        Text = Program.Title;
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Font = new Font("Microsoft YaHei UI", 10);
        ClientSize = new Size(460, 205);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        var title = new Label { Text = Program.Title, Font = new Font(Font, FontStyle.Bold), AutoSize = true, Location = new Point(25, 22) };
        status.Text = "正在打开本机题库…";
        status.SetBounds(25, 60, 410, 60);
        open.Text = "打开学习页面"; open.Enabled = false; open.SetBounds(25, 135, 170, 42);
        open.Click += delegate { OpenPage(); };
        var exit = new Button { Text = "退出程序", Location = new Point(265, 135), Size = new Size(170, 42) };
        exit.Click += delegate { Close(); };
        Controls.AddRange(new Control[] { title, status, open, exit });
        Shown += async delegate {
            try { startup = service.Start(); await startup; ready = true; if (!closing) { status.Text = "已启动，学习记录保存在本机。\n关闭此窗口即可退出程序。"; open.Enabled = true; OpenPage(); } }
            catch (Exception e) { if (!closing) status.Text = "启动失败：" + e.Message; }
        };
        timer.Interval = 350;
        timer.Tick += delegate {
            if (signal.WaitOne(0)) { WindowState = FormWindowState.Normal; Show(); Activate(); OpenPage(); }
            if (ready && !closing && service.HasExited) { ready = false; open.Enabled = false; status.Text = "程序已停止，请关闭此窗口后重新打开。"; }
        };
        timer.Start();
    }
    private void OpenPage()
    {
        if (!ready || closing) return;
        try { Process.Start(new ProcessStartInfo(service.Origin + "/#entrances") { UseShellExecute = true }); }
        catch { status.Text = "请在浏览器打开：\n" + service.Origin; }
    }
    protected override async void OnFormClosing(FormClosingEventArgs e)
    {
        if (!allowClose)
        {
            e.Cancel = true;
            if (!closing)
            {
                closing = true; open.Enabled = false; status.Text = "正在保存并退出…";
                if (startup != null) { try { await startup; } catch { } }
                await service.Stop();
                allowClose = true; Close();
            }
        }
        base.OnFormClosing(e);
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { timer.Dispose(); service.Dispose(); }
        base.Dispose(disposing);
    }
}

internal sealed class LocalService : IDisposable
{
    private readonly string root;
    private Process process;
    private bool started;
    private IntPtr job;
    private readonly StringBuilder errors = new StringBuilder();
    internal string Origin { get; private set; }
    internal bool HasExited { get { return !started || process == null || process.HasExited; } }
    internal LocalService(string root) { this.root = root; }
    internal async Task Start()
    {
        var ready = new TaskCompletionSource<string>();
        string node = Path.Combine(root, "runtime", "node.exe");
        if (!File.Exists(node)) throw new Exception("文件不完整，请先解压整个压缩包，再打开 EXE。");
        var info = new ProcessStartInfo(node, "\"" + Path.Combine(root, "server.mjs") + "\"") {
            WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        info.EnvironmentVariables["EXAM_PORT"] = "0";
        info.EnvironmentVariables["EXAM_LAUNCHER"] = "1";
        // A user's Node development settings must not alter the bundled runtime.
        info.EnvironmentVariables.Remove("NODE_OPTIONS"); info.EnvironmentVariables.Remove("NODE_PATH");
        process = new Process { StartInfo = info, EnableRaisingEvents = true };
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) {
            if (e.Data != null && e.Data.StartsWith("YU_READY ", StringComparison.Ordinal)) ready.TrySetResult(e.Data.Substring(9));
        };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) lock (errors) { if (errors.Length < 2000) errors.AppendLine(e.Data); } };
        process.Exited += delegate { ready.TrySetException(new Exception("本机服务未能启动，请确认文件夹可写。")); };
        Exception startupError = null;
        try
        {
            if (!process.Start()) throw new Exception("无法打开本机服务。");
            started = true;
            AttachJob();
            process.BeginOutputReadLine(); process.BeginErrorReadLine();
            if (await Task.WhenAny(ready.Task, Task.Delay(20000)) != ready.Task) throw new Exception("启动超时，请重新打开程序。");
            string address = await ready.Task;
            Uri uri;
            if (!Uri.TryCreate(address, UriKind.Absolute, out uri) || uri.Scheme != "http" || uri.Host != "127.0.0.1" || uri.Port < 1 || uri.AbsolutePath != "/") throw new Exception("本机地址无效。");
            Origin = address.TrimEnd('/');
        }
        catch (Exception e) { startupError = e; }
        if (startupError != null) { await Stop(); throw startupError; }
    }
    internal async Task Stop()
    {
        if (HasExited) return;
        try { process.StandardInput.WriteLine("shutdown"); process.StandardInput.Close(); } catch { }
        await Task.Run(delegate { if (!process.WaitForExit(15000)) { try { process.Kill(); process.WaitForExit(5000); } catch { } } });
    }
    private void AttachJob()
    {
        job = CreateJobObject(IntPtr.Zero, null);
        var limits = new JobLimits(); limits.Basic.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE
        int size = Marshal.SizeOf(limits);
        IntPtr memory = Marshal.AllocHGlobal(size);
        try {
            Marshal.StructureToPtr(limits, memory, false);
            if (job == IntPtr.Zero || !SetInformationJobObject(job, 9, memory, (uint)size) || !AssignProcessToJobObject(job, process.Handle)) throw new Exception("无法管理本机服务，请重新打开程序。");
        } finally { Marshal.FreeHGlobal(memory); }
    }
    public void Dispose()
    {
        if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
        if (process != null) { try { if (!process.HasExited) process.Kill(); } catch { } process.Dispose(); process = null; }
    }
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits { public long ProcessTime, JobTime; public uint LimitFlags; public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcesses; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] private struct JobLimits { public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll")] private static extern bool SetInformationJobObject(IntPtr job, int type, IntPtr info, uint length);
    [DllImport("kernel32.dll")] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
}
