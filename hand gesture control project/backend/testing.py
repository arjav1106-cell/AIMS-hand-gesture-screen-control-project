import cv2
import mediapipe as mp
import numpy as np
import torch
import torch.nn as nn
import subprocess
import time
import shutil
from groq import Groq
import json
import os

groq_client = Groq(api_key="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")

HISTORY_FILE = "backend/gesture_history.json"

def save_gesture_history(label, gesture_type, fingers, function_cmd):
    entry = {
        "gesture": label,
        "gesture_type": gesture_type,
        "fingers": fingers,
        "function": function_cmd
    }
    if not os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "w") as f:
            json.dump([], f)
    with open(HISTORY_FILE, "r") as f:
        data = json.load(f)
    data.append(entry)
    with open(HISTORY_FILE, "w") as f:
        json.dump(data, f, indent=2)

def llm_to_command(instruction):
    prompt = f"""
You are a Windows system command generator.

Convert a natural language instruction into ONE executable Windows terminal command.

STRICT RULES:
- Output EXACTLY ONE LINE.
- Output ONLY the command.
- NO explanations.
- NO markdown.
- NO quotes.
- If impossible return NOT_EXECUTABLE

Allowed formats:
start <app/url>
explorer
shutdown
control
cmd /c start ms-settings:
cmd /c <command>
powershell -Command <command>

Instruction:
{instruction}
"""
    completion = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role":"user","content":prompt}],
        temperature=0
    )
    return completion.choices[0].message.content.strip()

def is_executable(cmd):
    if cmd=="NOT_EXECUTABLE":
        return False
    exe = cmd.split()[0]
    if exe.lower()=="ms-settings:":
        return True
    if shutil.which(exe):
        return True
    builtins=["start","explorer","powershell","cmd","shutdown","control"]
    return exe.lower() in builtins

def execute_command(cmd):
    if cmd.startswith("ms-settings:"):
        cmd="cmd /c start "+cmd
    if not is_executable(cmd):
        print("SYSTEM:",cmd,"is not executable")
        return
    print("EXECUTING:",cmd)
    subprocess.Popen(cmd,shell=True)

class GestureANN(nn.Module):
    def __init__(self,input_size=63,num_classes=1):
        super().__init__()
        self.net=nn.Sequential(
            nn.Linear(input_size,128),
            nn.ReLU(),
            nn.Linear(128,64),
            nn.ReLU(),
            nn.Linear(64,num_classes)
        )
    def forward(self,x):
        return self.net(x)

X_data=[];Y_data=[]
label_to_id={};id_to_label={}
recording=False
current_label=None
predict_mode=False
model=None
last_exec_time=0
COOLDOWN=4
CONF_THRESHOLD=0.85

STABLE_FRAMES_REQUIRED=8
gesture_counter=0
current_detected=None

typing_label=False
typing_type=False
typing_fingers=False
typed_text=""
typed_type=""
typed_fingers=""

mp_hands=mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    model_complexity=1,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6
)

mp_draw=mp.solutions.drawing_utils
cap=cv2.VideoCapture(0)

def normalize_landmarks(lm):
    data=np.array(lm)
    wrist=data[0]
    data=data-wrist
    m=np.max(np.abs(data))
    if m>0:data=data/m
    return data.flatten()

def train_model():
    global model
    if not label_to_id:
        return
    X=torch.tensor(np.array(X_data),dtype=torch.float32)
    Y=torch.tensor(Y_data,dtype=torch.long)
    model=GestureANN(num_classes=len(label_to_id))
    opt=torch.optim.Adam(model.parameters(),lr=0.001)
    loss_fn=nn.CrossEntropyLoss()
    for _ in range(50):
        out=model(X)
        loss=loss_fn(out,Y)
        opt.zero_grad();loss.backward();opt.step()

while True:

    ret,frame=cap.read()
    if not ret: break

    rgb=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
    results=hands.process(rgb)
    display="IDLE"

    if results.multi_hand_landmarks:

        lm=results.multi_hand_landmarks[0]
        mp_draw.draw_landmarks(frame,lm,mp_hands.HAND_CONNECTIONS)

        landmark_list=[[p.x,p.y,p.z] for p in lm.landmark]
        features=normalize_landmarks(landmark_list)

        if recording and current_label:
            X_data.append(features)
            Y_data.append(label_to_id[current_label])
            display=f"REC {current_label}"

        elif predict_mode and model:

            tensor=torch.tensor(features,dtype=torch.float32).unsqueeze(0)

            with torch.no_grad():
                out=model(tensor)
                probs=torch.softmax(out,dim=1)
                conf,pred=torch.max(probs,dim=1)

            if conf.item()>CONF_THRESHOLD:

                gesture=id_to_label[pred.item()]
                display=gesture

                if gesture==current_detected:
                    gesture_counter+=1
                else:
                    current_detected=gesture
                    gesture_counter=1

                if gesture_counter>=STABLE_FRAMES_REQUIRED:

                    now=time.time()

                    if now-last_exec_time>COOLDOWN:

                        print("GESTURE:",gesture)

                        try:
                            cmd=llm_to_command(gesture)
                            print("LLM COMMAND:",cmd)
                            execute_command(cmd)
                            last_exec_time=now
                        except Exception as e:
                            print("LLM ERROR:",e)

                    gesture_counter=0

            else:
                gesture_counter=0
                current_detected=None

    else:
        gesture_counter=0
        current_detected=None

    if typing_label:
        display="GESTURE: "+typed_text
    if typing_type:
        display="TYPE: "+typed_type
    if typing_fingers:
        display="FINGERS: "+typed_fingers

    cv2.putText(frame,display,(20,50),
                cv2.FONT_HERSHEY_SIMPLEX,1,(0,255,255),2)

    cv2.imshow("Universal Agent",frame)

    key=cv2.waitKey(1)&0xFF

    if typing_label:

        if key==13:
            typing_label=False
            typing_type=True

        elif key==8:
            typed_text=typed_text[:-1]

        elif key!=255:
            typed_text+=chr(key)

    elif typing_type:

        if key==13:
            typing_type=False
            typing_fingers=True

        elif key==8:
            typed_type=typed_type[:-1]

        elif key!=255:
            typed_type+=chr(key)

    elif typing_fingers:

        if key==13:
            label=typed_text.strip()
            gesture_type=typed_type.strip()
            fingers=typed_fingers.strip()

            typed_text=""
            typed_type=""
            typed_fingers=""
            typing_fingers=False

            if label:
                if label not in label_to_id:
                    i=len(label_to_id)
                    label_to_id[label]=i
                    id_to_label[i]=label
                current_label=label
                recording=True
                predict_mode=False

                try:
                    cmd=llm_to_command(label)
                except:
                    cmd=""

                save_gesture_history(label,gesture_type,fingers,cmd)

        elif key==8:
            typed_fingers=typed_fingers[:-1]

        elif key!=255:
            typed_fingers+=chr(key)

    else:

        if key==ord('r'):
            typing_label=True
            typed_text=""

        elif key==ord('s'):
            recording=False

        elif key==ord('t'):
            recording=False
            train_model()

        elif key==ord('p'):
            predict_mode=True

        elif key==ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
