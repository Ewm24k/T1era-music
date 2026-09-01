FILE 1: Daily Operator Quick-Reference Guide

```
 conda activate t1era
```
```
tail -f ~/T1era-music/error.log
```

```
sudo systemctl restart t1era-music
```

==================================================
Do this when has new update file on Github
==================================================
```
cd ~/T1era-music
```
```
git pull
```
```
sudo systemctl restart t1era-music
```



This guide contains the exact commands and workflows to start, check, and maintain your T1ERA Music server.
1. How to Connect via SSH
Whenever you start or restart your VM in the Google Cloud Console, you need to open a terminal connection.
Option A (Web Terminal - Easiest):
Go to your GCP Console -> Compute Engine -> VM instances.
Find t1era-music-server in the list.
Click the SSH button in the row. A browser terminal window will open automatically.
Option B (Local Terminal - If you have GCloud SDK installed locally):
code
Bash
gcloud compute ssh tengkufiboking@t1era-music-server --project=t1erav2 --zone=asia-southeast1-c
2. How to Check the Server Status & Logs
Once connected, you do not need sudo privileges to monitor your application's status or read its logs.
Check if the server is running:
code
Bash
systemctl status t1era-music
Look for the green active (running) indicator.
Monitor live Gunicorn/Flask activity (No Sudo):
code
Bash
tail -f ~/T1era-music/error.log
This outputs incoming requests, audio download status, and sequential pipeline progress. Press Ctrl + C to exit the log stream.
Check your active Conda environments:
code
Bash
conda env list
###3. How to Start or Update Ngrok (If a new secure link is needed)
If you restart your VM or restart your Ngrok process, Ngrok will generate a brand-new secure https:// address. You must run Ngrok and update your frontend configuration.
Open an SSH window and start the tunnel:
code
Bash
```
./ngrok http 5000
```
Copy the new secure URL:
Look at the terminal output for the line starting with Forwarding. It will look like this:
Forwarding https://a1b2-35-247-154-247.ngrok-free.app -> http://localhost:5000
Copy the https://... portion of that URL.
Update your frontend:
Open assets/js/app.js on your computer (or via GitHub) and paste the new URL into line 17:
code
JavaScript
const RENDER_BACKEND_URL = "https://YOUR-NEW-SUBDOMAIN.ngrok-free.app/transcribe";
Keep Ngrok running:
Keep this terminal window open. If you close it, the tunnel will break. To run other commands on the VM, simply open a second SSH window
