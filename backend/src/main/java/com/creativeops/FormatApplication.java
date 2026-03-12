package com.creativeops;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for the CreativeOps Format Adapter backend.
 *
 * Start the server:
 *   cd backend
 *   mvn spring-boot:run
 *
 * The server listens on http://localhost:8080
 * The frontend expects this URL at BACKEND_URL in js/format.js.
 */
@SpringBootApplication
public class FormatApplication {

    public static void main(String[] args) {
        SpringApplication.run(FormatApplication.class, args);
    }
}
