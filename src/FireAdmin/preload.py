import torch

print("⏳ Pre-downloading MiDaS model to Docker cache...")
# This triggers the download of the code and the weights
torch.hub.load("intel-isl/MiDaS", "MiDaS_small")
print("✅ Model downloaded and cached!")