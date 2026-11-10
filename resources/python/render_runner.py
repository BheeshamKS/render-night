import sys
import time

def main():
    print("RN_EVENT {\"type\":\"device_report\",\"devices\":[]}")
    for i in range(1, 4):
        print(f"Fra: {i}/3")
        time.sleep(0.1)
        print(f"Saved: \"/tmp/frame_{i:04d}.png\"")
        print(f"RN_EVENT {{\"type\":\"frame_end\",\"frame\":{i},\"scene\":\"Scene\",\"saved\":\"/tmp/frame_{i:04d}.png\"}}")

if __name__ == "__main__":
    main()
