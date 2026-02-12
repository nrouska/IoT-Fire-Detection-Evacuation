#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <curl/curl.h>

#define INFLUXDB_URL "http://labserver.sense-campus.gr:8086/api/v2/write?org=students&bucket=2fcpu202526&precision=s"
#define TOKEN "SPznlS5ex4N1VVpyw8zP5bmYk9zirOSobxkudh6f9rmpQ7ys-zYNBVTHxB4eD3LZt52YgDf7y0OX_SidearXlg=="  // Replace with your InfluxDB token

int main() {
    while (1){
        FILE *fp = fopen("/proc/meminfo", "r");
        if (!fp) {
            perror("fopen");
            return 1;
        }

        long total = 0, free = 0, buffers = 0, cached = 0;
        char label[64];
        long value;

        while (fscanf(fp, "%63s %ld", label, &value) != EOF) {
            if (strcmp(label, "MemTotal:") == 0)
                total = value;
            else if (strcmp(label, "MemFree:") == 0)
                free = value;
            else if (strcmp(label, "Buffers:") == 0)
                buffers = value;
            else if (strcmp(label, "Cached:") == 0)
                cached = value;
        }

        fclose(fp);

        long used = total - (free + buffers + cached);
        double usage = (double)used / total * 100;

        printf("RAM Usage: %.2f%%\n", usage);

        char data[512];
        snprintf(data, sizeof(data), "ram,core=ram usage=%f", usage);

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

        usleep(2000000);
    }
    return 0;
}
