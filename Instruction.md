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
git reset --hard HEAD
```
```
git pull origin main
```
```
sudo systemctl restart t1era-music
```

##Check Active Ngrol Url

```
curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*'
```

```
nohup ~/ngrok http 5000 > /dev/null 2>&1 &
```

#Get Link Url
```
curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*'
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

===================================================
Restore VM Factory

```# 1. Move out of the corrupted folder to your home directory
cd ~

# 2. Copy your important keys and cookies safely to your home folder
cp ~/T1era-music/firebase-key.json ~/
cp ~/T1era-music/cookies.txt ~/

# 3. Delete the corrupted T1era-music folder completely
rm -rf ~/T1era-music

# 4. Clone a fresh, clean copy of your repository from GitHub
git clone https://github.com/Ewm24k/T1era-music.git

# 5. Move your credentials and cookies back into the new project folder
mv ~/firebase-key.json ~/T1era-music/
mv ~/cookies.txt ~/T1era-music/
```

=====================================================

Check status ngrok

```
ps aux | grep '[n]grok'
```
```
curl https://crock-blast-purchase.ngrok-free.dev/
```
```
sudo systemctl status t1era-music --no-pager
ps aux | grep '[n]grok'
curl https://crock-blast-purchase.ngrok-free.dev/
```

#After update new file run this 

```
# 1. Pull the new files
cd ~/T1era-music
git pull origin main

# 2. Point the service at ivory_orchestrator.py — this chain-imports
#    vortex_orchestrator.py -> main.py, so ALL THREE routes register:
#    /transcribe, /transcribe-vortex, /transcribe-ivory
sudo sed -i 's/ vortex_orchestrator:app$/ ivory_orchestrator:app/' /etc/systemd/system/t1era-music.service

# 3. Confirm the edit landed
grep ExecStart /etc/systemd/system/t1era-music.service
# should end in ivory_orchestrator:app

# 4. Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart t1era-music

# 5. Check it came up clean (watch for import errors)
sudo systemctl status t1era-music
tail -n 40 /home/tengkufiboking/T1era-music/error.log

# 6. Test the new route
curl -i -X POST https://crock-blast-purchase.ngrok-free.dev/transcribe-ivory \
  -H 'Content-Type: application/json' \
  -H 'ngrok-skip-browser-warning: true' \
  -d '{"userId":"test_user","jobId":"test_job_ivory","youtubeUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
# expect 202 QUEUED

# 7. Sanity-check the other two still work
curl https://crock-blast-purchase.ngrok-free.dev/
curl -i -X POST https://crock-blast-purchase.ngrok-free.dev/transcribe-vortex \
  -H 'Content-Type: application/json' -H 'ngrok-skip-browser-warning: true' \
  -d '{"userId":"test_user","jobId":"test_job_vortex2","youtubeUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```
#Check error log

```
tail -n 100 /home/tengkufiboking/T1era-music/error.log
```
