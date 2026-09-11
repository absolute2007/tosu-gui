using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace OsuAudioControl
{
    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorComObject { }

    internal enum EDataFlow { eRender, eCapture, eAll }
    internal enum ERole { eConsole, eMultimedia, eCommunications }

    internal static class DeviceState
    {
        public const int DEVICE_STATE_ACTIVE = 0x00000001;
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(EDataFlow dataFlow, int dwStateMask, out IMMDeviceCollection ppDevices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
        int GetDevice(string pwstrId, out IMMDevice ppDevice);
        int RegisterEndpointNotificationCallback(IntPtr pClient);
        int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection
    {
        int GetCount(out int pcDevices);
        int Item(int nDevice, out IMMDevice ppDevice);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice
    {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out int pdwState);
    }

    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionManager2
    {
        int GetAudioSessionControl(ref Guid AudioSessionGuid, int StreamFlags, out IntPtr SessionControl);
        int GetSimpleAudioVolume(ref Guid AudioSessionGuid, int StreamFlags, out IntPtr AudioVolume);
        int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
        int RegisterSessionNotification(IntPtr NewSessionNotifications);
        int UnregisterSessionNotification(IntPtr NewSessionNotifications);
        int RegisterDuckNotification(string sessionID, IntPtr duckNotification);
        int UnregisterDuckNotification(IntPtr duckNotification);
    }

    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionEnumerator
    {
        int GetCount(out int SessionCount);
        int GetSession(int SessionIndex, out IAudioSessionControl Session);
    }

    [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionControl
    {
        int GetState(out int pRetVal);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        int GetGroupingParam(out Guid pRetVal);
        int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        int RegisterAudioSessionNotification(IntPtr NewNotifications);
        int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    }

    [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionControl2 : IAudioSessionControl
    {
        new int GetState(out int pRetVal);
        new int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        new int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        new int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        new int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        new int GetGroupingParam(out Guid pRetVal);
        new int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        new int RegisterAudioSessionNotification(IntPtr NewNotifications);
        new int UnregisterAudioSessionNotification(IntPtr NewNotifications);

        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        int GetProcessId(out uint pRetVal);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool optOut);
    }

    [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface ISimpleAudioVolume
    {
        int SetMasterVolume(float fLevel, ref Guid EventContext);
        int GetMasterVolume(out float pfLevel);
        int SetMute(bool bMute, ref Guid EventContext);
        int GetMute(out bool pbMute);
    }

    public static class Program
    {
        private static readonly Guid IID_IAudioSessionManager2 = typeof(IAudioSessionManager2).GUID;
        private static bool _weMuted = false;

        private static List<IMMDevice> GetAllRenderDevices(IMMDeviceEnumerator enumerator)
        {
            var devices = new List<IMMDevice>();

            // Always add default device first
            IMMDevice defaultDev = null;
            if (enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out defaultDev) == 0 && defaultDev != null)
            {
                devices.Add(defaultDev);
            }

            // Also enumerate all active render devices to cover secondary headsets / speakers
            IMMDeviceCollection coll = null;
            if (enumerator.EnumAudioEndpoints(EDataFlow.eRender, DeviceState.DEVICE_STATE_ACTIVE, out coll) == 0 && coll != null)
            {
                int count = 0;
                coll.GetCount(out count);
                for (int i = 0; i < count; i++)
                {
                    IMMDevice dev;
                    if (coll.Item(i, out dev) == 0 && dev != null)
                    {
                        devices.Add(dev);
                    }
                }
            }

            return devices;
        }

        private static bool IsTargetProcess(uint pid, int targetPid, string targetName)
        {
            if (pid == 0) return false;
            if (targetPid > 0 && pid == (uint)targetPid) return true;

            try
            {
                var proc = Process.GetProcessById((int)pid);
                string pName = proc.ProcessName;
                if (!string.IsNullOrEmpty(targetName))
                {
                    return string.Equals(pName, targetName, StringComparison.OrdinalIgnoreCase);
                }

                // Default matching: osu! (stable) and osu (lazer)
                return string.Equals(pName, "osu!", StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(pName, "osu", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private static int SetMuteForTarget(bool mute, int targetPid, string targetName)
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            var devices = GetAllRenderDevices(enumerator);

            int matchedCount = 0;
            var seenSessions = new HashSet<IntPtr>();

            foreach (var dev in devices)
            {
                try
                {
                    object obj;
                    var iid = IID_IAudioSessionManager2;
                    if (dev.Activate(ref iid, 1 /* CLSCTX_INPROC_SERVER */, IntPtr.Zero, out obj) != 0 || obj == null)
                    {
                        continue;
                    }

                    var mgr = (IAudioSessionManager2)obj;
                    IAudioSessionEnumerator sessionEnum;
                    if (mgr.GetSessionEnumerator(out sessionEnum) != 0 || sessionEnum == null)
                    {
                        continue;
                    }

                    int sessionCount;
                    sessionEnum.GetCount(out sessionCount);

                    for (int i = 0; i < sessionCount; i++)
                    {
                        IAudioSessionControl ctl;
                        if (sessionEnum.GetSession(i, out ctl) != 0 || ctl == null)
                        {
                            continue;
                        }

                        var ctl2 = ctl as IAudioSessionControl2;
                        if (ctl2 == null) continue;

                        uint pid;
                        ctl2.GetProcessId(out pid);

                        if (IsTargetProcess(pid, targetPid, targetName))
                        {
                            var vol = ctl as ISimpleAudioVolume;
                            if (vol != null)
                            {
                                Guid empty = Guid.Empty;
                                vol.SetMute(mute, ref empty);
                                matchedCount++;
                            }
                        }
                    }
                }
                catch
                {
                    // Ignore failures on inactive or disconnecting devices
                }
            }

            if (mute && matchedCount > 0)
            {
                _weMuted = true;
            }
            else if (!mute)
            {
                _weMuted = false;
            }

            return matchedCount;
        }

        private static void PrintStatus(int targetPid, string targetName)
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            var devices = GetAllRenderDevices(enumerator);

            bool found = false;
            bool isMuted = false;
            int sessions = 0;

            foreach (var dev in devices)
            {
                try
                {
                    object obj;
                    var iid = IID_IAudioSessionManager2;
                    if (dev.Activate(ref iid, 1, IntPtr.Zero, out obj) != 0 || obj == null) continue;

                    var mgr = (IAudioSessionManager2)obj;
                    IAudioSessionEnumerator sessionEnum;
                    if (mgr.GetSessionEnumerator(out sessionEnum) != 0 || sessionEnum == null) continue;

                    int count;
                    sessionEnum.GetCount(out count);
                    for (int i = 0; i < count; i++)
                    {
                        IAudioSessionControl ctl;
                        if (sessionEnum.GetSession(i, out ctl) != 0 || ctl == null) continue;

                        var ctl2 = ctl as IAudioSessionControl2;
                        if (ctl2 == null) continue;

                        uint pid;
                        ctl2.GetProcessId(out pid);
                        if (IsTargetProcess(pid, targetPid, targetName))
                        {
                            found = true;
                            sessions++;
                            var vol = ctl as ISimpleAudioVolume;
                            if (vol != null)
                            {
                                bool m;
                                vol.GetMute(out m);
                                if (m) isMuted = true;
                            }
                        }
                    }
                }
                catch { }
            }

            Console.WriteLine(string.Format("{{\"ok\":true,\"found\":{0},\"muted\":{1},\"sessions\":{2}}}",
                found ? "true" : "false",
                isMuted ? "true" : "false",
                sessions));
            Console.Out.Flush();
        }

        private static void RunDaemon(int targetPid, string targetName)
        {
            Console.WriteLine("{\"ok\":true,\"daemon\":true,\"ready\":true}");
            Console.Out.Flush();

            AppDomain.CurrentDomain.ProcessExit += (s, e) =>
            {
                if (_weMuted)
                {
                    try { SetMuteForTarget(false, targetPid, targetName); } catch { }
                }
            };

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;

                if (line.Equals("quit", StringComparison.OrdinalIgnoreCase) ||
                    line.Equals("exit", StringComparison.OrdinalIgnoreCase))
                {
                    if (_weMuted)
                    {
                        try { SetMuteForTarget(false, targetPid, targetName); } catch { }
                    }
                    Console.WriteLine("{\"ok\":true,\"daemon\":false}");
                    Console.Out.Flush();
                    break;
                }

                if (line.Equals("mute", StringComparison.OrdinalIgnoreCase))
                {
                    int count = SetMuteForTarget(true, targetPid, targetName);
                    Console.WriteLine(string.Format("{{\"ok\":true,\"action\":\"mute\",\"matched\":{0}}}", count));
                    Console.Out.Flush();
                }
                else if (line.Equals("unmute", StringComparison.OrdinalIgnoreCase))
                {
                    int count = SetMuteForTarget(false, targetPid, targetName);
                    Console.WriteLine(string.Format("{{\"ok\":true,\"action\":\"unmute\",\"matched\":{0}}}", count));
                    Console.Out.Flush();
                }
                else if (line.Equals("status", StringComparison.OrdinalIgnoreCase))
                {
                    PrintStatus(targetPid, targetName);
                }
                else
                {
                    Console.WriteLine("{\"ok\":false,\"error\":\"unknown command\"}");
                    Console.Out.Flush();
                }
            }

            if (_weMuted)
            {
                try { SetMuteForTarget(false, targetPid, targetName); } catch { }
            }
        }

        public static int Main(string[] args)
        {
            int targetPid = 0;
            string targetName = null;
            bool isDaemon = false;
            string command = "status";

            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i].Trim();
                if (a.Equals("--daemon", StringComparison.OrdinalIgnoreCase) || a.Equals("-d", StringComparison.OrdinalIgnoreCase))
                {
                    isDaemon = true;
                }
                else if (a.Equals("mute", StringComparison.OrdinalIgnoreCase) ||
                         a.Equals("unmute", StringComparison.OrdinalIgnoreCase) ||
                         a.Equals("status", StringComparison.OrdinalIgnoreCase))
                {
                    command = a.ToLowerInvariant();
                }
                else if (int.TryParse(a, out targetPid))
                {
                    // numeric argument is pid
                }
                else
                {
                    targetName = a;
                }
            }

            try
            {
                if (isDaemon)
                {
                    RunDaemon(targetPid, targetName);
                    return 0;
                }

                if (command == "mute")
                {
                    int count = SetMuteForTarget(true, targetPid, targetName);
                    Console.WriteLine(string.Format("{{\"ok\":true,\"action\":\"mute\",\"matched\":{0}}}", count));
                    return 0;
                }
                else if (command == "unmute")
                {
                    int count = SetMuteForTarget(false, targetPid, targetName);
                    Console.WriteLine(string.Format("{{\"ok\":true,\"action\":\"unmute\",\"matched\":{0}}}", count));
                    return 0;
                }
                else
                {
                    PrintStatus(targetPid, targetName);
                    return 0;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("{{\"ok\":false,\"error\":\"{0}\"}}", ex.Message.Replace("\"", "\\\"")));
                return 1;
            }
        }
    }
}
