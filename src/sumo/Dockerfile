# 1. Χρησιμοποιήστε το επίσημο είδωλο του SUMO ως βάση
FROM ghcr.io/eclipse-sumo/sumo:main

# 2. Εγκατάσταση της Python και του pip (αν δεν υπάρχουν ήδη)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libparquet-dev \
    libarrow-dev \
    && rm -rf /var/lib/apt/lists/*
# 3. Ορισμός φακέλου εργασίας μέσα στο container
WORKDIR /app

# 4. Αντιγραφή του αρχείου requirements.txt και εγκατάσταση βιβλιοθηκών
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# 5. Αντιγραφή όλου του κώδικα της Flask και των αρχείων του SUMO
COPY . .

# 6. Ορισμός περιβάλλοντος για το SUMO (SUMO_HOME)
# Στα είδωλα του SUMO είναι συνήθως προκαθορισμένο, αλλά καλό είναι να υπάρχει
ENV SUMO_HOME=/usr/share/sumo

# 7. Άνοιγμα της πόρτας που ακούει ο Flask (π.χ. 5000)
EXPOSE 5001

# 8. Εντολή για την εκκίνηση του Flask server
CMD ["python3", "simulation.py"]