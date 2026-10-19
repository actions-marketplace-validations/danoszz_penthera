from transformers import AutoModel, pipeline

model = AutoModel.from_pretrained("meta-llama/Llama-3.1-8B-Instruct")
classifier = pipeline("text-classification", model="acme-labs/support-intent")
not_a_model = "docs/readme.md"
