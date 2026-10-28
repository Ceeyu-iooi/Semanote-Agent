package io.semanote.api;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** The built Vue entry is served by the same local origin as the REST API. */
@Controller
public class PageController {
    @GetMapping({"/", "/developer"})
    public String index() { return "forward:/index.html"; }
}
