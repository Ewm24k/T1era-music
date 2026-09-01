Step 1: Stop the current foreground Ngrok
If Ngrok is currently active and taking up your terminal screen, stop it by pressing:
Ctrl + C
Step 2: Start Ngrok in the Background
Run this command to start Ngrok as an isolated background process [4.1]:
code
Bash
nohup ./ngrok http 5000 > /dev/null 2>&1 &
nohup tells the VM to keep running Ngrok even if you disconnect from SSH [4.1].
> /dev/null 2>&1 silences all the terminal text output.
& tells the operating system to run this process in the background, freeing up your command line immediately [4.1].
Step 3: How to retrieve your Secure URL (Since it's in the background)
Since Ngrok is running in the background, you will no longer see the terminal dashboard. You can fetch your active secure URL at any time by querying Ngrok's local API with this command:
code
Bash
curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*'
Copy the secure https:// URL that prints out, update line 17 of your assets/js/app.js, and you can safely close your SSH window!
Useful Commands to Manage Ngrok
To check if Ngrok is still running in the background:
code
Bash
ps aux | grep ngrok
To stop the background Ngrok tunnel in the future:
code
Bash
pkill ngrok
