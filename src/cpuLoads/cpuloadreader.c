#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <regex.h>
#include <curl/curl.h>

#define PATERN "cpu([0-9])[[:space:]]([0-9]+)[[:space:]]([0-9]+)[[:space:]]([0-9]+)[[:space:]]([0-9]+)[[:space:]]([0-9]+)[[:space:]]([0-9]+)[[:space:]]([0-9]+)[[:space:]]([0-9]+)[[:space:]]([0-9]+)[[:space:]]([0-9]+)"

#define INFLUXDB_URL "http://labserver.sense-campus.gr:8086/api/v2/write?org=students&bucket=2fcpu202526&precision=s"
#define TOKEN "SPznlS5ex4N1VVpyw8zP5bmYk9zirOSobxkudh6f9rmpQ7ys-zYNBVTHxB4eD3LZt52YgDf7y0OX_SidearXlg=="  // Replace with your InfluxDB token

typedef struct {
    unsigned long long user, nice, system, idle, iowait, irq, softirq, steal;
} CpuTimes;

void readCpuTimes(regex_t regex, CpuTimes **cpuTimes, int *cpus);
void printCpuPercentages(CpuTimes *cpuTimes1, CpuTimes *cpuTimes2, int cpus);
void sentToInfluxDb(double* usages, int cpus);

int main(){
    regex_t regex;
    int cpus = 0;
    CpuTimes* cpuTimes1 = malloc(0*sizeof(CpuTimes));
    CpuTimes* cpuTimes2 = malloc(0*sizeof(CpuTimes));

    if (regcomp(&regex, PATERN, REG_EXTENDED) != 0) {
        printf("Failed to compile regex\n");
        return 1;
    }

    while (1){
        readCpuTimes(regex, &cpuTimes1, &cpus);
        usleep(2000000);
        cpus = 0;
        readCpuTimes(regex, &cpuTimes2, &cpus);
        printCpuPercentages(cpuTimes1, cpuTimes2, cpus);
    }

    for (int i = 0; i < cpus; i++){
        printf("user\t%llu\nnice\t%llu\nsystem\t%llu\nidle\t%llu\niowait\t%llu\nirq\t%llu\nsoftirq\t%llu\nsteal\t%llu",
            cpuTimes1[i].user,
            cpuTimes1[i].nice,
            cpuTimes1[i].system,
            cpuTimes1[i].idle,
            cpuTimes1[i].iowait,
            cpuTimes1[i].irq,
            cpuTimes1[i].softirq,
            cpuTimes1[i].steal
        );
        printf("\n\n\n");
    }

    free(cpuTimes1);
    free(cpuTimes2);

    printf("The computer has %d cores\n", cpus);

    return 0;
}

void readCpuTimes(regex_t regex, CpuTimes **cpuTimes, int *cpus){
    regmatch_t matches[12];

    FILE *file = fopen("/proc/stat", "r");
    if (!file) {
        printf("Failed to open file");
        exit(-1);
    }

    char line[1024];

    while (fgets(line, sizeof(line), file) != NULL) {
        if (regexec(&regex, line, 12, matches, 0) == 0) {
            *cpus = *cpus + 1;
            *cpuTimes = realloc(*cpuTimes, (*cpus)*sizeof(CpuTimes));
            for (int i = 1; i < 12; i++) {
                if (matches[i].rm_so == -1) continue; // no match

                int start = matches[i].rm_so;
                int end = matches[i].rm_eo;

                char* group = malloc((end-start+1)*sizeof(char));

                // Print substring
                for (int j = start; j < end; j++) {
                    memcpy(group+j-start, line+j, sizeof(char));
                }
                group[end-start] = '\0';

                unsigned long long val = strtoull(group, NULL, 10);

                free(group);

                switch(i){
                    case 2: (*cpuTimes)[(*cpus)-1].user = val; break;
                    case 3: (*cpuTimes)[(*cpus)-1].nice = val; break;
                    case 4: (*cpuTimes)[(*cpus)-1].system = val; break;
                    case 5: (*cpuTimes)[(*cpus)-1].idle = val; break;
                    case 6: (*cpuTimes)[(*cpus)-1].iowait = val; break;
                    case 7: (*cpuTimes)[(*cpus)-1].irq = val; break;
                    case 8: (*cpuTimes)[(*cpus)-1].softirq = val; break;
                    case 9: (*cpuTimes)[(*cpus)-1].steal = val; break;
                }
            }
        }
    }

    fclose(file);
}

void printCpuPercentages(CpuTimes *cpuTimes1, CpuTimes *cpuTimes2, int cpus) {
    double usages[cpus] = {};
    for (int i = 0; i < cpus; i++){
        unsigned long long busy1 = cpuTimes1[i].user + cpuTimes1[i].nice + cpuTimes1[i].system + cpuTimes1[i].irq + cpuTimes1[i].softirq + cpuTimes1[i].steal;
        unsigned long long total1 = busy1 + cpuTimes1[i].idle + cpuTimes1[i].iowait;
        unsigned long long busy2 = cpuTimes2[i].user + cpuTimes2[i].nice + cpuTimes2[i].system + cpuTimes2[i].irq + cpuTimes2[i].softirq + cpuTimes2[i].steal;
        unsigned long long total2 = busy2 + cpuTimes2[i].idle + cpuTimes2[i].iowait;
        double usage = ((double)(busy2 - busy1) / (double)(total2 - total1))*100.0f;
        printf("cpu%d usage is %.2f%\n", i, usage);
        usages[i] = usage;
    }
    printf("\n\n\n");
    sentToInfluxDb(usages, cpus);
}

void sentToInfluxDb(double* usages, int cpus){
    char data[512];
    snprintf(data, sizeof(data),
             "cpu,core=cpu0 usage=%f\n"
             "cpu,core=cpu1 usage=%f\n"
             "cpu,core=cpu2 usage=%f\n"
             "cpu,core=cpu3 usage=%f\n"
             "cpu,core=cpu4 usage=%f\n"
             "cpu,core=cpu5 usage=%f",
             usages[0], usages[1], usages[2], usages[3], usages[4], usages[5]);

    CURL *curl;
    CURLcode res;

    curl_global_init(CURL_GLOBAL_DEFAULT);
    curl = curl_easy_init();

    if(curl) {
        struct curl_slist *headers = NULL;
        headers = curl_slist_append(headers, "Content-Type: text/plain");
        char auth_header[256];
        snprintf(auth_header, sizeof(auth_header), "Authorization: Token %s", TOKEN);
        headers = curl_slist_append(headers, auth_header);

        curl_easy_setopt(curl, CURLOPT_URL, INFLUXDB_URL);
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, data);

        res = curl_easy_perform(curl);

        if(res != CURLE_OK)
            fprintf(stderr, "curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
        else
            printf("Data uploaded successfully!\n");

        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);
    } else {
        printf("ERROR!!!!\n");
    }

    curl_global_cleanup();
}